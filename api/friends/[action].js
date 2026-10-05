import { chuliHaoyouList } from '../../server/friends.js';

export default async function handler(req, res) {
  const action = String(req.query?.action || '');
  return chuliHaoyouList(req, res, action);
}
