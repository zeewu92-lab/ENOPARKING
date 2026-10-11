import type { SQLiteDatabase } from 'expo-sqlite';

export declare const NATIVE_EVENT_STORE_SCHEMA: string;

export declare function initializeNativeEventStore(db: SQLiteDatabase): Promise<void>;

export interface NativeLearningEvent {
  eventId: string;
  type: 'action' | 'unit_outcome';
  payload: Record<string, unknown>;
  createdAt: number;
  localCounter?: number;
  accountId?: string;
}

export declare class NativeEventStore {
  constructor(db: SQLiteDatabase, options?: { clock?: () => number });
  getOrCreateDeviceId(createId: () => string | Promise<string>): Promise<string>;
  enqueue(
    accountId: string,
    event: NativeLearningEvent,
    options?: { applyOptimisticState?: (tx: SQLiteDatabase, event: NativeLearningEvent) => Promise<void> }
  ): Promise<NativeLearningEvent>;
  getOrCreateDeviceId(createId: () => string | Promise<string>): Promise<string>;
  getReplayCursor(accountId: string): Promise<number>;
  pendingForSync(
    accountId: string,
    options?: { limit?: number; now?: number }
  ): Promise<Array<NativeLearningEvent & { attemptCount: number }>>;
  recordSyncFailure(accountId: string, eventIds: string[], errorCode: string): Promise<void>;
  reconcileAcks(
    accountId: string,
    acknowledgements: Array<{ eventId: string; serverSequence: number }>
  ): Promise<void>;
  applyReplay(
    accountId: string,
    events: Array<NativeLearningEvent & { serverSequence: number }>,
    applyEvent: (tx: SQLiteTransaction, event: NativeLearningEvent & { serverSequence: number }) => Promise<void>
  ): Promise<{ appliedCount: number }>;
}
