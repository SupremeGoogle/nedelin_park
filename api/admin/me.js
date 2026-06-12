import { isAdmin } from '../_lib/auth.js';

export default async function handler(req, res) {
  return res.status(200).json({ admin: isAdmin(req) });
}
