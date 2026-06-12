import { kvGet, kvSet, kvConfigured } from './_lib/kv.js';
import { isAdmin } from './_lib/auth.js';
import { DEFAULT_CONTENT, CONTENT_KEY } from './_lib/defaults.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    let data = null;
    if (kvConfigured()) {
      try { data = await kvGet(CONTENT_KEY); }
      catch (e) { console.error('KV get failed:', e.message); }
    }
    return res.status(200).json(data || DEFAULT_CONTENT);
  }

  if (req.method === 'PUT') {
    if (!isAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    if (!kvConfigured()) {
      return res.status(500).json({ ok: false, error: 'kv_not_configured' });
    }
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); }
      catch { return res.status(400).json({ ok: false, error: 'bad_json' }); }
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ ok: false, error: 'bad_payload' });
    }
    // Ограничение размера: KV хранит строки до 1 МБ. Большие base64-фото нужно отправлять отдельно или хранить на CDN.
    const serialized = JSON.stringify(body);
    if (serialized.length > 900_000) {
      return res.status(413).json({ ok: false, error: 'payload_too_large', size: serialized.length });
    }
    try { await kvSet(CONTENT_KEY, body); }
    catch (e) {
      console.error('KV set failed:', e.message);
      return res.status(500).json({ ok: false, error: 'kv_write_failed' });
    }
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
