/** Configuration required to authenticate with the Violet API. */
export interface VioletAuthConfig {
  appId: string;
  appSecret: string;
  username: string;
  password: string;
  apiBase: string;
}

/** Internal token state managed by VioletTokenManager. */
export interface VioletTokenData {
  token: string;
  refreshToken: string;
  /** Timestamp (ms) when the token was obtained — used to calculate expiry. */
  loginTimestamp: number;
}

/** Shape of the Violet POST /login response body. */
export interface VioletLoginResponse {
  id: string;
  email: string;
  token: string;
  refresh_token: string;
  type: string;
  verified: boolean;
  status: string;
  roles: string[];
}

/** Headers required on every authenticated Violet API call. */
export interface VioletAuthHeaders {
  "X-Violet-Token": string;
  "X-Violet-App-Id": string;
  "X-Violet-App-Secret": string;
}
