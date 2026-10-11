export class NativeAuthApiError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  constructor(code: string, status: number, retryable?: boolean);
}
export interface NativeAuthTokenPair {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
export declare class NativeAuthApi {
  constructor(options: { baseUrl: string; fetchImpl?: typeof fetch });
  login(input: { username: string; password: string }): Promise<NativeAuthTokenPair>;
  refresh(input: { accountId: string; refreshToken: string; refreshRequestId: string }): Promise<NativeAuthTokenPair>;
  revoke(input: { accountId: string; refreshToken: string }): Promise<{ ok: boolean }>;
}
