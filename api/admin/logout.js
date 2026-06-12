import { clearAdminCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  res.setHeader('Set-Cookie', clearAdminCookie());
  return res.status(200).json({ ok: true });
}
