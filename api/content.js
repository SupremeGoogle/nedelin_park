import { kvGet, kvSet, kvConfigured } from './_lib/kv.js';
import { isAdmin } from './_lib/auth.js';
import { DEFAULT_CONTENT, CONTENT_KEY } from './_lib/defaults.js';
import { githubConfigured, githubGetContent, githubSetContent } from './_lib/github-content.js';
import { readFile } from 'node:fs/promises';

async function localContent() {
  try {
    const raw = await readFile(new URL('../content.json', import.meta.url), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    let data = null;
    if (kvConfigured()) {
      try { data = await kvGet(CONTENT_KEY); }
      catch (e) { console.error('KV get failed:', e.message); }
    }
    if (!data && githubConfigured()) {
      try { data = await githubGetContent(); }
      catch (e) { console.error('GitHub content get failed:', e.message); }
    }
    if (!data) {
      data = await localContent();
    }
    return res.status(200).json(data || DEFAULT_CONTENT);
  }

  if (req.method === 'PUT') {
    if (!isAdmin(req)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
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
    if (kvConfigured()) {
      try {
        await kvSet(CONTENT_KEY, body);
        return res.status(200).json({ ok: true, storage: 'kv', visibleSoon: false });
      }
      catch (e) {
        console.error('KV set failed:', e.message);
      }
    }
    if (githubConfigured()) {
      try {
        const saved = await githubSetContent(body);
        return res.status(200).json({ ok: true, storage: 'github', visibleSoon: true, ...saved });
      } catch (e) {
        console.error('GitHub content set failed:', e.message);
        return res.status(500).json({ ok: false, error: 'github_write_failed' });
      }
    }
    return res.status(500).json({ ok: false, error: 'storage_not_configured' });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ ok: false, error: 'method_not_allowed' });
}
