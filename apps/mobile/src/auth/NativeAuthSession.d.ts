import type { NativeSession } from './NativeCredentialVault.js';
import type { NativeAuthApi } from './NativeAuthApi.js';
export interface NativeAuthSessionController {
  login(input: { username: string; password: string }): Promise<NativeSession>;
  restore(): Promise<NativeSession | null>;
  refresh(accountId: string): Promise<NativeSession>;
  logout(): Promise<{ status: 'signed_out'; accountId?: string }>;
  getActiveSession(): NativeSession | null;
  getAccessCredentials(accountId: string): Promise<{ accountId: string; accessToken: string } | null>;
}
export declare function createNativeAuthSession(options?: {
  baseUrl?: string;
  api?: Pick<NativeAuthApi, 'login' | 'refresh' | 'revoke'>;
  vault?: {
    saveLogin(input: { accountId: string; accessToken: string; refreshToken: string; expiresAt: number }): Promise<NativeSession>;
    restoreSession(options: { refresh: (input: { accountId: string; refreshToken: string; refreshRequestId: string }) => Promise<{ accountId: string; accessToken: string; refreshToken: string; expiresAt: number }> }): Promise<NativeSession | null>;
    rotateRefreshToken(options: { accountId: string; refresh: (input: { accountId: string; refreshToken: string; refreshRequestId: string }) => Promise<{ accountId: string; accessToken: string; refreshToken: string; expiresAt: number }> }): Promise<NativeSession>;
    logout(options: { revoke: (input: { accountId: string; refreshToken: string }) => Promise<unknown> }): Promise<{ status: 'signed_out'; accountId?: string }>;
    getActiveSession(): NativeSession | null;
    getAccessCredentials(accountId: string): Promise<{ accountId: string; accessToken: string } | null>;
  };
}): NativeAuthSessionController;
