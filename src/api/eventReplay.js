import { pushEvents, pullEvents } from './eventSync.js';

export async function replayEvents({
  queue,
  clientVersion,
  push = pushEvents,
  pull = pullEvents,
  applyEvent,
  batchSize = 100,
  maxPullBatches = 100
}) {
  if (!queue || typeof queue.pendingForSync !== 'function' || typeof queue.reconcile !== 'function') {
    throw new Error('EVENT_QUEUE_INVALID');
  }
  if (typeof applyEvent !== 'function') throw new Error('EVENT_APPLY_HANDLER_REQUIRED');
  if (typeof clientVersion !== 'string' || !clientVersion.trim()) throw new Error('CLIENT_VERSION_REQUIRED');

  const report = { pushed: 0, confirmed: 0, failed: 0, replayed: 0, skipped: 0, cursor: queue.getReplayCursor() };
  const pending = queue.pendingForSync(batchSize);
  if (pending.length) {
    const response = await push({
      deviceId: queue.getDeviceId(),
      clientVersion,
      events: pending
    });
    if (!Array.isArray(response?.results)) throw new Error('EVENT_SYNC_RESPONSE_INVALID');
    const reconciled = queue.reconcile(response.results);
    const pushedIds = new Set(pending.map(event => event.eventId));
    const reconciledById = new Map(reconciled.map(event => [event.eventId, event]));
    report.pushed = pending.length;
    report.confirmed = [...pushedIds].filter(eventId => reconciledById.get(eventId)?.syncStatus === 'confirmed').length;
    report.failed = [...pushedIds].filter(eventId => reconciledById.get(eventId)?.syncStatus === 'failed').length;
  }

  let batches = 0;
  while (batches < maxPullBatches) {
    const response = await pull({ afterSequence: report.cursor, limit: batchSize });
    if (!Array.isArray(response?.events) ||
        !Number.isSafeInteger(response.nextSequence) ||
        response.nextSequence < report.cursor ||
        typeof response.hasMore !== 'boolean') {
      throw new Error('EVENT_PULL_RESPONSE_INVALID');
    }

    for (const event of response.events) {
      const sequence = event?.serverSequence;
      if (typeof event?.eventId !== 'string' || !event.eventId.trim() ||
          !Number.isSafeInteger(sequence) || sequence <= report.cursor) {
        throw new Error('EVENT_PULL_SEQUENCE_INVALID');
      }
      if (sequence !== report.cursor + 1) throw new Error('EVENT_PULL_CURSOR_GAP');
      if (!queue.hasApplied(event.eventId)) {
        await applyEvent(event);
        queue.markApplied(event.eventId);
        report.replayed += 1;
      } else {
        report.skipped += 1;
      }
      queue.setReplayCursor(sequence);
      report.cursor = sequence;
    }

    const nextSequence = response.nextSequence;
    if (nextSequence > report.cursor) {
      // Server sequences are contiguous. Never skip unseen events by jumping
      // to a high-water cursor, even if a malformed response claims the page is empty.
      throw new Error('EVENT_PULL_CURSOR_GAP');
    }

    batches += 1;
    if (!response.hasMore) break;
  }

  if (batches >= maxPullBatches) report.moreAvailable = true;
  return report;
}
