import type { NativeLearningEvent } from '../storage/NativeEventStore.js';

type NativeLearningTransaction = {
  getFirstAsync(
    sql: string,
    ...params: (string | number)[]
  ): Promise<{ stateJson: string } | null>;
  runAsync(
    sql: string,
    ...params: (string | number)[]
  ): Promise<unknown>;
};

export declare function applyNativeLearningEvent(
  tx: NativeLearningTransaction,
  accountId: string,
  event: NativeLearningEvent & { serverSequence?: number },
  options?: { now?: number }
): Promise<boolean>;

export declare function recordNativeLearningAction(options: {
  store: {
    enqueue(
      accountId: string,
      event: NativeLearningEvent,
      options: {
        applyOptimisticState: (
          tx: NativeLearningTransaction,
          event: NativeLearningEvent
        ) => Promise<void>;
      }
    ): Promise<NativeLearningEvent>;
  };
  accountId: string;
  payload: {
    wordId: string;
    day: number;
    verification: 'choice' | 'spelling' | 'dictation' | 'usage';
    result: 'correct' | 'wrong';
    hintLevel: 'none';
    unitId?: string | null;
  };
  createEventId: () => string | Promise<string>;
  now?: number;
}): Promise<NativeLearningEvent>;

export interface NativeWordLearningState {
  wordId: string;
  reviewCount: number;
  scores: { meaning: number; spelling: number; listening: number; usage: number };
  mastery: { covered: number; coverage: number; lowest: number; base: number; overall: number; state: string };
  stability: { stability: number; progress: number; requiredRecovery: number };
  lastEvent: object | null;
  nextReviewDay: number;
  nextVerification: 'choice' | 'spelling' | 'dictation' | 'usage';
  selectedDimension: 'meaning' | 'spelling' | 'listening' | 'usage';
}

export declare function replayNativeWordLearning(events: any[], wordId: string, day: number): NativeWordLearningState;
export declare function getNativeWordLearningState(db: { getAllAsync: (...args: any[]) => Promise<any[]> }, accountId: string, wordId: string, day: number): Promise<NativeWordLearningState>;
