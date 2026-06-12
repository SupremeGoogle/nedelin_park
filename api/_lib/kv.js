// Минималистичный клиент Vercel KV / Upstash через REST.
// Не тянем @vercel/kv ради нулевых зависимостей и быстрого холодного старта.

const URL_ENV  = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN    = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function ensureConfigured() {
  if (!URL_ENV || !TOKEN) {
    throw new Error('KV is not configured: set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel');
  }
}

async function exec(command) {
  ensureConfigured();
  const r = await fetch(URL_ENV, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`KV error ${r.status}: ${text}`);
  }
  const json = await r.json();
  return json.result;
}

export async function kvGet(key) {
  const raw = await exec(['GET', key]);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function kvSet(key, value) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return exec(['SET', key, raw]);
}

export function kvConfigured() {
  return Boolean(URL_ENV && TOKEN);
}
