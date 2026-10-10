import type { SQLiteDatabase, SQLiteTransaction } from 'expo-sqlite';

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
  enqueue(
    accountId: string,
    event: NativeLearningEvent,
    options?: { applyOptimisticState?: (tx: SQLiteTransaction, event: NativeLearningEvent) => Promise<void> }
  ): Promise<NativeLearningEvent>;
  pendingForSync(
    accountId: string,
    options?: { limit?: number; now?: number }
  ): Promise<Array<NativeLearningEvent & { attemptCount: number }>>;
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
