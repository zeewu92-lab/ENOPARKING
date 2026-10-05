import { ERROR_RETENTION, REQUIRED_RECOVERY_UNITS, SAME_CONTEXT_FACTORS, STABILITY_BANDS } from './constants.js';

function indexOfBand(stability) {
  const index = STABILITY_BANDS.findIndex((value) => Math.abs(value - stability) < 1e-9);
  if (index < 0) throw new Error('Unknown stability band: ' + stability);
  return index;
}
function requiredFor(stability) {
  if (stability < 0.5) return 0;
  const index = indexOfBand(stability);
  if (index >= STABILITY_BANDS.length - 1) return 0;
  const next = STABILITY_BANDS[index + 1];
  return REQUIRED_RECOVERY_UNITS[stability.toFixed(1) + '->' + next.toFixed(1)];
}

export class StabilityEngine {
  constructor({ initialStability = 0.5, initialProgress = 0 } = {}) {
    this.stability = initialStability;
    this.progress = initialProgress;
    this.episode = null;
    this.contextCounts = new Map();
  }
  snapshot() {
    return { stability: this.stability, progress: this.progress, requiredRecovery: requiredFor(this.stability) };
  }
  contextFactor({ wordId, day, verification, dimensions }) {
    const key = JSON.stringify([wordId, day, verification, [...dimensions].sort()]);
    const count = this.contextCounts.get(key) ?? 0;
    this.contextCounts.set(key, count + 1);
    return SAME_CONTEXT_FACTORS[Math.min(count, SAME_CONTEXT_FACTORS.length - 1)];
  }
  sameEpisode({ wordId, day, verification, dimensions }) {
    if (!this.episode) return false;
    return this.episode.wordId === wordId &&
      this.episode.day === day &&
      this.episode.verification === verification &&
      JSON.stringify(this.episode.dimensions) === JSON.stringify([...dimensions].sort());
  }
  startEpisode({ wordId, day, verification, dimensions }) {
    this.episode = { wordId, day, verification, dimensions: [...dimensions].sort(), s0: this.stability, errors: 0 };
  }
  registerError(context) {
    if (!this.sameEpisode(context)) {
      const closed = this.endErrorEpisode();
      this.startEpisode(context);
      this.episode.errors = 1;
      return { closed, strength: 'weak', episode: this.episode };
    }
    this.episode.errors += 1;
    const strength = this.episode.errors === 2 ? 'medium' : 'strong';
    return { closed: null, strength, episode: this.episode };
  }
  endErrorEpisode() {
    if (!this.episode) return null;
    const episode = this.episode;
    const oldStability = this.stability;
    const oldRequired = requiredFor(oldStability);
    const oldProgress = this.progress;
    const oldIndex = indexOfBand(oldStability);
    const newStability = STABILITY_BANDS[Math.max(0, oldIndex - 1)];
    const newRequired = requiredFor(newStability);
    const remapped = oldRequired === 0 ? 0 : Math.min(oldProgress * (newRequired / oldRequired), newRequired);
    const strength = episode.errors === 1 ? 'weak' : episode.errors === 2 ? 'medium' : 'strong';
    const coefficient = ERROR_RETENTION[strength];
    this.stability = newStability;
    this.progress = Math.min(remapped * coefficient, newRequired);
    this.episode = null;
    return { wordId: episode.wordId, day: episode.day, verification: episode.verification, strength, oldStability, newStability, oldRequired, newRequired, oldProgress, remappedProgress: remapped, coefficient, newProgress: this.progress };
  }
  applyRecovery({ wordId, day, verification, dimensions, evidenceStrength, eventMultiplier = 1.0, dimensionEvidence = 1.0 }) {
    const before = this.snapshot();
    const factor = this.contextFactor({ wordId, day, verification, dimensions });
    const evidence = Math.floor(evidenceStrength * eventMultiplier * factor * dimensionEvidence + 1e-9);
    if (this.stability >= 1.0) {
      this.progress = 0;
      return { before, after: this.snapshot(), evidence, rawEvidence: evidenceStrength, factor, transitions: 0 };
    }
    this.progress += evidence;
    const required = requiredFor(this.stability);
    let transitions = 0;
    if (this.progress >= required && required > 0) {
      this.stability = STABILITY_BANDS[indexOfBand(this.stability) + 1];
      this.progress -= required;
      this.progress = Math.min(this.progress, requiredFor(this.stability));
      transitions = 1;
    }
    return { before, after: this.snapshot(), evidence, rawEvidence: evidenceStrength, factor, transitions };
  }
}
