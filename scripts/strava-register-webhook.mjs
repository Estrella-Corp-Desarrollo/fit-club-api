/**
 * Register (or list) Strava push subscriptions.
 *
 * Usage:
 *   node scripts/strava-register-webhook.mjs
 *   node scripts/strava-register-webhook.mjs --list
 *   node scripts/strava-register-webhook.mjs --delete <id>
 *
 * Requires STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_VERIFY_TOKEN,
 * STRAVA_WEBHOOK_CALLBACK_URL in env / .env
 */
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = (process.env.STRAVA_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.STRAVA_CLIENT_SECRET || "").trim();
const VERIFY_TOKEN = (process.env.STRAVA_VERIFY_TOKEN || "").trim();
const CALLBACK_URL = (process.env.STRAVA_WEBHOOK_CALLBACK_URL || "").trim();

const BASE = "https://www.strava.com/api/v3/push_subscriptions";

const args = process.argv.slice(2);

async function listSubscriptions() {
  const url = `${BASE}?client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;
  const res = await fetch(url);
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

async function deleteSubscription(id) {
  const url = `${BASE}/${id}?client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;
  const res = await fetch(url, { method: "DELETE" });
  console.log("delete status", res.status);
  if (!res.ok) {
    const text = await res.text();
    console.error(text);
    process.exit(1);
  }
}

async function createSubscription() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    callback_url: CALLBACK_URL,
    verify_token: VERIFY_TOKEN,
  });

  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  console.log(JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

(async () => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET are required");
    process.exit(1);
  }

  if (args[0] === "--list") {
    await listSubscriptions();
    return;
  }

  if (args[0] === "--delete") {
    if (!args[1]) {
      console.error("Usage: --delete <subscriptionId>");
      process.exit(1);
    }
    await deleteSubscription(args[1]);
    return;
  }

  if (!CALLBACK_URL || !VERIFY_TOKEN) {
    console.error("STRAVA_WEBHOOK_CALLBACK_URL and STRAVA_VERIFY_TOKEN are required");
    process.exit(1);
  }

  await createSubscription();
})();
