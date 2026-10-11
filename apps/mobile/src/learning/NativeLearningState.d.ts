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
