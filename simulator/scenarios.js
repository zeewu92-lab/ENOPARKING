export const positiveBaseline = {
  initialScores: { meaning: 0, spelling: 0, listening: 0, usage: 0 },
  events: [
    { wordId: 'w1', day: 1, verification: 'choice', result: 'correct' },
    { wordId: 'w1', day: 2, verification: 'spelling', result: 'correct' },
    { wordId: 'w1', day: 6, verification: 'dictation', result: 'correct' },
    { wordId: 'w1', day: 15, verification: 'usage', result: 'correct' },
    { wordId: 'w1', day: 35, verification: 'choice', result: 'correct' },
  ],
};

export const missingListening = {
  initialScores: { meaning: 0, spelling: 0, listening: 0, usage: 0 },
  events: [
    { wordId: 'w1', day: 1, verification: 'choice', result: 'correct' },
    { wordId: 'w1', day: 2, verification: 'spelling', result: 'correct' },
    { wordId: 'w1', day: 6, verification: 'dictation', result: 'correct' },
    { wordId: 'w1', day: 15, verification: 'usage', result: 'correct' },
    { wordId: 'w1', day: 35, verification: 'choice', result: 'correct' },
    { wordId: 'w1', day: 55, verification: 'dictation', result: 'correct' },
    { wordId: 'w1', day: 70, verification: 'usage', result: 'correct' },
    { wordId: 'w1', day: 90, verification: 'choice', result: 'correct' },
    { wordId: 'w1', day: 105, verification: 'spelling', result: 'correct' },
    { wordId: 'w1', day: 125, verification: 'usage', result: 'correct' },
    { wordId: 'w1', day: 140, verification: 'choice', result: 'correct' },
    { wordId: 'w1', day: 155, verification: 'spelling', result: 'correct' },
    { wordId: 'w1', day: 175, verification: 'usage', result: 'correct' },
  ],
};

export const reverseBaseline = {
  initialScores: { meaning: 90, spelling: 90, listening: 90, usage: 90 },
  initialStability: 0.9,
  initialProgress: 0,
  events: [
    { wordId: 'w1', day: 1, verification: 'choice', result: 'incorrect' },
    { wordId: 'w1', day: 2, verification: 'spelling', result: 'incorrect' },
    { wordId: 'w1', day: 3, verification: 'dictation', result: 'incorrect' },
    { wordId: 'w1', day: 3, verification: 'usage', result: 'incorrect' },
    { wordId: 'w1', day: 3, verification: 'choice', result: 'incorrect' },
    { wordId: 'w1', day: 5, verification: 'choice', result: 'incorrect' },
    { wordId: 'w1', day: 5, verification: 'spelling', result: 'incorrect' },
    { wordId: 'w1', day: 8, verification: 'choice', result: 'incorrect' },
  ],
};
