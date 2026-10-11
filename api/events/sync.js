import { chuliEventSync } from '../../server/event-sync.js';

export default async function handler(req, res) {
  return chuliEventSync(req, res);
}
