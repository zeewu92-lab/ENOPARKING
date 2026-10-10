import { chuliEventPull } from '../../server/event-pull.js';

export default async function handler(req, res) {
  return chuliEventPull(req, res);
}
