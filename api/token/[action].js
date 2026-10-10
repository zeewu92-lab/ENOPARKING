import { chuliTokenAuth } from '../../server/token-auth.js';

export default async function handler(req, res) {
  const action = String(req.query?.action || '');
  return chuliTokenAuth(req, res, action);
}
