import { chuliAuth } from '../../server/auth.js';

export default async function handler(req, res) {
  const action = String(req.query?.action || '');
  return chuliAuth(req, res, action);
}
