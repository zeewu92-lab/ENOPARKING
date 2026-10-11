export interface NativeSession {
  accountId: string;
  accessToken: string;
  expiresAt: number;
}
export interface NativeRefreshResponse extends NativeSession {
  refreshToken: string;
}
export interface NativeSecureStoreAdapter {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
export declare class NativeCredentialVault {
  constructor(options: { secureStore: NativeSecureStoreAdapter; now?: () => number; createRefreshRequestId: () => string | Promise<string> });
  saveLogin(input: NativeRefreshResponse): Promise<NativeSession>;
  getActiveSession(): NativeSession | null;
  getAccessCredentials(accountId: string): Promise<{ accountId: string; accessToken: string } | null>;
  getRefreshToken(accountId: string): Promise<string | null>;
  rotateRefreshToken(options: {
    accountId: string;
    refresh: (input: { accountId: string; refreshToken: string; refreshRequestId: string }) => Promise<NativeRefreshResponse>;
  }): Promise<NativeSession>;
  logout(options?: {
    revoke?: (input: { accountId: string; refreshToken: string }) => Promise<unknown>;
  }): Promise<{ status: 'signed_out'; accountId?: string }>;
  restoreSession(options: {
    refresh: (input: { accountId: string; refreshToken: string; refreshRequestId: string }) => Promise<NativeRefreshResponse>;
  }): Promise<NativeSession | null>;
  clearAllLocalCredentials(): Promise<void>;
}
