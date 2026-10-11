const inFlight = new Map();

export function runSingleFlight(key, operation) {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return Promise.reject(new Error('SINGLE_FLIGHT_KEY_REQUIRED'));
  if (typeof operation !== 'function') return Promise.reject(new Error('SINGLE_FLIGHT_OPERATION_REQUIRED'));

  const existing = inFlight.get(normalizedKey);
  if (existing) return existing;

  const pending = Promise.resolve().then(operation).finally(() => {
    if (inFlight.get(normalizedKey) === pending) inFlight.delete(normalizedKey);
  });
  inFlight.set(normalizedKey, pending);
  return pending;
}
