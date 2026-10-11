export interface NativeSyncLifecycleSource {
  addEventListener(event: 'change', listener: (state: string) => void):
    { remove(): void } | (() => void) | void;
}
export interface NativeSyncCoordinatorOptions {
  getActiveAccountId: () => string | null | undefined | Promise<string | null | undefined>;
  syncAccount: (
    accountId: string,
    context: {
      reasons: string[];
      isCurrentAccount: () => Promise<boolean>;
    }
  ) => Promise<unknown>;
  isOnline?: () => boolean;
  onError?: (error: unknown, context: unknown) => void;
}
export declare class NativeSyncCoordinator {
  constructor(options: NativeSyncCoordinatorOptions);
  start(options: {
    appState: NativeSyncLifecycleSource;
    subscribeNetwork?: (listener: (online: boolean) => void) => (() => void) | void;
  }): () => void;
  stop(): void;
  requestSync(reason?: string): Promise<
    | { status: 'stopped' }
    | { status: 'offline'; reasons: string[] }
    | { status: 'no_active_account'; reasons: string[] }
    | { status: 'account_changed'; reasons: string[] }
    | { status: 'synced'; accountId: string; reasons: string[] }
    | { status: 'error'; reasons: string[]; error: unknown }
  >;
}
