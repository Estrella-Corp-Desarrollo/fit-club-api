/**
 * Strava env helpers. Secrets never leave the server.
 */

const trim = (value?: string | null) =>
  typeof value === "string" ? value.trim() : "";

const getStravaClientId = () => trim(process.env.STRAVA_CLIENT_ID);
const getStravaClientSecret = () => trim(process.env.STRAVA_CLIENT_SECRET);

const getStravaRedirectUri = () =>
  trim(process.env.STRAVA_REDIRECT_URI) ||
  `${trim(process.env.APP_URL) || "http://127.0.0.1:1337"}/api/app/strava/callback`;

const getStravaVerifyToken = () => trim(process.env.STRAVA_VERIFY_TOKEN);
const getStravaWebhookCallbackUrl = () =>
  trim(process.env.STRAVA_WEBHOOK_CALLBACK_URL);

const getFitclubWebUrl = () =>
  trim(process.env.FITCLUB_WEB_URL) || "http://localhost:5173";

const getStateSecret = () =>
  trim(process.env.STRAVA_STATE_SECRET) ||
  trim(process.env.JWT_SECRET) ||
  "fitclub-strava-state-dev";

/** OAuth can start when Client ID (and ideally secret) are configured. */
const isStravaOauthReady = () =>
  Boolean(getStravaClientId() && getStravaClientSecret());

const getStravaScopes = () =>
  trim(process.env.STRAVA_SCOPES) || "activity:read_all,profile:read_all";

export {
  getStravaClientId,
  getStravaClientSecret,
  getStravaRedirectUri,
  getStravaVerifyToken,
  getStravaWebhookCallbackUrl,
  getFitclubWebUrl,
  getStateSecret,
  isStravaOauthReady,
  getStravaScopes,
};
