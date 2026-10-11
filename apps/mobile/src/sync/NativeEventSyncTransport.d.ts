import type { NativeLearningEvent } from '../storage/NativeEventStore';
import type { NativePulledEvent, NativePushResult } from './NativeEventSyncService';

export interface NativeEventSyncTransport {
  pushEvents(request: {
    accessToken: string;
    deviceId: string;
    clientVersion: string;
    events: NativeLearningEvent[];
  }): Promise<{ results: NativePushResult[] }>;
  pullEvents(request: {
    accessToken: string;
    afterSequence: number;
    limit?: number;
  }): Promise<{ events: NativePulledEvent[]; nextSequence: number; hasMore: boolean }>;
}
export declare function createNativeEventSyncTransport(options: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): NativeEventSyncTransport;
