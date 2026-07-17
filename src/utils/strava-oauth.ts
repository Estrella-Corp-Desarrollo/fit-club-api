/**
 * Strava OAuth helpers: signed state, authorize URL, token exchange/refresh.
 */

import crypto from "crypto";
import {
  getFitclubWebUrl,
  getStateSecret,
  getStravaClientId,
  getStravaClientSecret,
  getStravaRedirectUri,
  getStravaScopes,
} from "./strava-config";

const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const DEAUTHORIZE_URL = "https://www.strava.com/oauth/deauthorize";
const STATE_TTL_MS = 15 * 60 * 1000;

type StatePayload = {
  userId: number;
  nonce: string;
  exp: number;
};

const base64url = (input: string | Buffer) => {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
};

const fromBase64url = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
};

const signState = (userId: number) => {
  const payload: StatePayload = {
    userId,
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const data = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", getStateSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
};

const verifyState = (state: string): { userId: number } | { error: string } => {
  if (!state || typeof state !== "string" || !state.includes(".")) {
    return { error: "Invalid OAuth state" };
  }

  const [data, sig] = state.split(".");
  if (!data || !sig) return { error: "Invalid OAuth state" };

  const expected = crypto
    .createHmac("sha256", getStateSecret())
    .update(data)
    .digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { error: "Invalid OAuth state signature" };
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(fromBase64url(data));
  } catch {
    return { error: "Invalid OAuth state payload" };
  }

  if (!payload?.userId || !payload.exp) {
    return { error: "Invalid OAuth state payload" };
  }
  if (Date.now() > payload.exp) {
    return { error: "OAuth state expired" };
  }

  return { userId: Number(payload.userId) };
};

const buildAuthorizeUrl = (userId: number) => {
  const clientId = getStravaClientId();
  if (!clientId) {
    throw new Error("STRAVA_CLIENT_ID is not configured");
  }

  const state = signState(userId);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: getStravaRedirectUri(),
    approval_prompt: "auto",
    scope: getStravaScopes(),
    state,
  });

  return `${AUTHORIZE_URL}?${params.toString()}`;
};

const buildSuccessRedirect = (status: "connected" | "error", message?: string) => {
  // Land on `/` so hosts without SPA fallback (no try_files / .htaccess) still
  // serve index.html. FitClubWeb then client-navigates to /running/profile.
  const base = getFitclubWebUrl().replace(/\/$/, "");
  const params = new URLSearchParams({ strava: status });
  if (message) params.set("message", message);
  return `${base}/?${params.toString()}`;
};

type TokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  scope?: string;
  athlete?: { id: number; [key: string]: unknown };
};

const postToken = async (body: Record<string, string>): Promise<TokenResponse> => {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => ({}))) as TokenResponse & {
    message?: string;
    errors?: unknown;
  };

  if (!response.ok) {
    const detail =
      json?.message ||
      (typeof json?.errors === "string" ? json.errors : null) ||
      `HTTP ${response.status}`;
    throw new Error(`Strava token error: ${detail}`);
  }

  if (!json.access_token || !json.refresh_token || !json.expires_at) {
    throw new Error("Strava token response incomplete");
  }

  return json;
};

const exchangeAuthorizationCode = async (code: string) =>
  postToken({
    client_id: getStravaClientId(),
    client_secret: getStravaClientSecret(),
    code,
    grant_type: "authorization_code",
  });

const refreshAccessToken = async (refreshToken: string) =>
  postToken({
    client_id: getStravaClientId(),
    client_secret: getStravaClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

const revokeAccessToken = async (accessToken: string) => {
  try {
    await fetch(DEAUTHORIZE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: accessToken }),
    });
  } catch {
    // Best-effort; FitClub disconnect must succeed even if Strava is unreachable.
  }
};

const expiresAtToIso = (expiresAtUnix: number) =>
  new Date(Number(expiresAtUnix) * 1000).toISOString();

export {
  signState,
  verifyState,
  buildAuthorizeUrl,
  buildSuccessRedirect,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeAccessToken,
  expiresAtToIso,
  TOKEN_URL,
};
