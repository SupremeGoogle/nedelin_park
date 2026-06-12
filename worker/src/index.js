// Cloudflare Worker — Telegram-прокси для Nedelin Park.
//
// Маршруты:
//   POST /notify          — приём заявок с Vercel и рассылка зарегистрированным админам
//   POST /tg/webhook      — webhook от Telegram (команда /nedelinpark регистрирует чат)
//   GET  /health          — health-check
//   GET  /admins          — (под секретом) список текущих админ chat_id
//
// Связь односторонняя: на Vercel не идём; только Vercel → Worker → Telegram
// и Telegram → Worker (для команды /nedelinpark).
//
// Bindings:
//   ADMINS         — KV namespace (хранит chat_id админов)
//   TELEGRAM_BOT_TOKEN     — secret
//   TELEGRAM_WEBHOOK_TOKEN — secret (Telegram прикладывает к каждому updates-вызову)
//   NOTIFY_SECRET          — secret, делится с Vercel (header X-Notify-Secret)

const ALLOW_COMMAND = '/nedelinpark';

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });

const text = (s, init = {}) =>
  new Response(s, { ...init, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...(init.headers || {}) } });

function timingSafeEqStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tgSend(env, chatId, payload) {
  const body = { chat_id: chatId, disable_web_page_preview: true, ...payload };
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r;
}

async function listAdmins(env) {
  // Храним по ключу admin:<chat_id> = '1', чтобы поддерживать постраничный list.
  const out = [];
  let cursor = undefined;
  do {
    const page = await env.ADMINS.list({ prefix: 'admin:', cursor });
    for (const k of page.keys) out.push(k.name.slice('admin:'.length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

async function addAdmin(env, chatId, username) {
  const key = `admin:${chatId}`;
  await env.ADMINS.put(key, JSON.stringify({ at: Date.now(), username: username || '' }));
}

async function removeAdmin(env, chatId) {
  await env.ADMINS.delete(`admin:${chatId}`);
}

// ----- POST /notify (от Vercel) -----
async function handleNotify(req, env) {
  const secret = req.headers.get('X-Notify-Secret') || '';
  if (!timingSafeEqStr(secret, env.NOTIFY_SECRET || '')) {
    return json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  let body;
  try { body = await req.json(); }
  catch { return json({ ok: false, error: 'bad_json' }, { status: 400 }); }

  const msg = (body && typeof body.text === 'string') ? body.text.slice(0, 3500) : '';
  if (!msg) return json({ ok: false, error: 'empty_text' }, { status: 400 });
  const parseMode = body.parse_mode || 'Markdown';

  const admins = await listAdmins(env);
  if (admins.length === 0) {
    console.log('No registered admins, skipping');
    return json({ ok: true, delivered: 0, note: 'no_admins' });
  }

  const results = await Promise.allSettled(
    admins.map(id => tgSend(env, id, { text: msg, parse_mode: parseMode }))
  );
  let delivered = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.ok) {
      delivered++;
    } else if (r.status === 'fulfilled') {
      const t = await r.value.text().catch(() => '');
      // Если бот заблокирован — снимаем подписку.
      if (r.value.status === 403 || /bot was blocked|chat not found|user is deactivated/i.test(t)) {
        await removeAdmin(env, admins[i]).catch(() => {});
      }
      console.log('tg send failed', admins[i], r.value.status, t.slice(0, 200));
    } else {
      console.log('tg send error', admins[i], r.reason?.message);
    }
  }
  return json({ ok: true, delivered, total: admins.length });
}

// ----- POST /tg/webhook (от Telegram) -----
async function handleTelegramWebhook(req, env) {
  const token = req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!timingSafeEqStr(token, env.TELEGRAM_WEBHOOK_TOKEN || '')) {
    return json({ ok: false }, { status: 403 });
  }
  let upd;
  try { upd = await req.json(); }
  catch { return json({ ok: false }, { status: 400 }); }

  const message = upd.message || upd.edited_message || upd.channel_post;
  if (!message || !message.chat) return json({ ok: true });
  const chatId = String(message.chat.id);
  const t = (message.text || '').trim();

  // Поддерживаем точное /nedelinpark и /nedelinpark@BotName
  const lower = t.toLowerCase();
  const isStart = lower === ALLOW_COMMAND || lower.startsWith(ALLOW_COMMAND + '@') || lower.startsWith(ALLOW_COMMAND + ' ');
  const isStop  = lower === '/stop_nedelinpark' || lower.startsWith('/stop_nedelinpark@');

  if (isStart) {
    await addAdmin(env, chatId, message.from?.username || message.chat.username || '');
    await tgSend(env, chatId, {
      text: '✅ Чат подключён. Сюда будут приходить заявки с сайта *Nedelin Park*.\n\nЧтобы отписаться — отправьте `/stop_nedelinpark`.',
      parse_mode: 'Markdown',
    });
  } else if (isStop) {
    await removeAdmin(env, chatId);
    await tgSend(env, chatId, { text: '🔕 Этот чат отписан от заявок Nedelin Park.' });
  }
  // Все остальные сообщения молча игнорируем — бот используется и другими сайтами.
  return json({ ok: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (req.method === 'GET' && path === '/health') {
      return json({ ok: true, ts: Date.now() });
    }

    if (req.method === 'POST' && path === '/notify') {
      return handleNotify(req, env);
    }

    if (req.method === 'POST' && path === '/tg/webhook') {
      return handleTelegramWebhook(req, env);
    }

    if (req.method === 'GET' && path === '/admins') {
      const secret = url.searchParams.get('s') || '';
      if (!timingSafeEqStr(secret, env.NOTIFY_SECRET || '')) {
        return json({ ok: false }, { status: 403 });
      }
      return json({ ok: true, admins: await listAdmins(env) });
    }

    return text('Nedelin Park proxy', { status: 200 });
  },
};
