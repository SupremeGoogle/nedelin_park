import { issueAdminCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const expected = process.env.ADMIN_CODE || 'nedelin062026';

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const code = body && typeof body.code === 'string' ? body.code : '';
  if (!code || code !== expected) {
    // Небольшая задержка против перебора. Vercel ограничивает время функции, для нашего случая ОК.
    await new Promise(r => setTimeout(r, 400));
    return res.status(401).json({ ok: false, error: 'bad_code' });
  }
  res.setHeader('Set-Cookie', issueAdminCookie());
  return res.status(200).json({ ok: true });
}
