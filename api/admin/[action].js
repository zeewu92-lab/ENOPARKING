import { chuliAdmin } from '../../server/admin.js';

export default async function handler(req, res) {
  const action = String(req.query?.action || '');
  return chuliAdmin(req, res, action);
}
