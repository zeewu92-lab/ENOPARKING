import type { NativeEventStore, NativeLearningEvent } from '../storage/NativeEventStore';

export interface NativeSyncCredentials {
  accountId: string;
  accessToken: string;
}
export interface NativePushResult {
  eventId: string;
  syncStatus: 'confirmed' | 'failed' | 'dead';
  serverSequence: number | null;
  error?: { code?: string; retryable?: boolean; retryAfterMs?: number } | null;
}
export interface NativePulledEvent extends NativeLearningEvent {
  serverSequence: number;
}
export declare class NativeEventSyncService {
  constructor(options: {
    store: NativeEventStore;
    getCredentials: (accountId: string) => Promise<NativeSyncCredentials>;
    getDeviceId: () => Promise<string> | string;
    pushEvents: (request: {
      accessToken: string;
      deviceId: string;
      clientVersion: string;
      events: NativeLearningEvent[];
    }) => Promise<{ results: NativePushResult[] }>;
    pullEvents: (request: {
      accessToken: string;
      afterSequence: number;
      limit: number;
    }) => Promise<{ events: NativePulledEvent[]; nextSequence: number; hasMore: boolean }>;
    applyEvent: (tx: unknown, event: NativePulledEvent) => Promise<void>;
    clientVersion?: string;
    maxPullBatches?: number;
  });
  syncAccount(accountId: string, options?: {
    isCurrentAccount?: () => Promise<boolean>;
  }): Promise<{
    status: 'synced' | 'account_changed' | 'more_available';
    pushed: number;
    confirmed: number;
    retried: number;
    replayed: number;
    skipped: number;
    cursor: number;
  }>;
}
