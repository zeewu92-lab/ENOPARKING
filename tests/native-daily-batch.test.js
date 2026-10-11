import test from 'node:test';
import assert from 'node:assert/strict';
import { getNativeDailyBatch } from '../apps/mobile/src/learning/NativeLearningAlgorithm.js';

function makeVocabulary(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index).padStart(2, '0')}`,
    word: `word${prefix}${index}`,
    meaning: `釋義 ${prefix} ${index}`,
    phonetic: '',
    textbook: 'test',
    unit: 'unit',
  }));
}

function fakeDb(rows) {
  return {
    async getAllAsync() {
      return rows;
    },
  };
}

test('native daily batch selects five new words when no review is due', async () => {
  const vocabulary = makeVocabulary('new', 12);
  const batch = await getNativeDailyBatch(fakeDb([]), 'account-a', vocabulary, 20640);
  assert.equal(batch.length, 5);
  assert.deepEqual(batch.map(word => word.id), vocabulary.slice(0, 5).map(word => word.id));
});

test('native daily batch caps due reviews at twenty and adds five new words', async () => {
  const reviewed = makeVocabulary('review', 25);
  const newWords = makeVocabulary('new', 10);
  const rows = reviewed.map((word, index) => ({
    eventId: `event-${index}`,
    localCounter: index + 1,
    serverSequence: null,
    type: 'action',
    payloadJson: JSON.stringify({
      wordId: word.id,
      day: 20637,
      verification: 'choice',
      result: 'wrong',
      hintLevel: 'none',
    }),
  }));
  const batch = await getNativeDailyBatch(
    fakeDb(rows),
    'account-a',
    [...reviewed, ...newWords],
    20640
  );
  assert.equal(batch.length, 25);
  assert.equal(batch.filter(word => word.id.startsWith('review-')).length, 20);
  assert.equal(batch.filter(word => word.id.startsWith('new-')).length, 5);
  assert.deepEqual(
    batch.slice(0, 20).map(word => word.id),
    reviewed.slice(0, 20).map(word => word.id)
  );
});

test('native daily batch rejects malformed local event payloads', async () => {
  await assert.rejects(
    getNativeDailyBatch(fakeDb([{
      eventId: 'broken',
      localCounter: 1,
      serverSequence: null,
      type: 'action',
      payloadJson: '{invalid json',
    }]), 'account-a', makeVocabulary('new', 2), 20640),
    /NATIVE_LEARNING_HISTORY_CORRUPT/
  );
});
