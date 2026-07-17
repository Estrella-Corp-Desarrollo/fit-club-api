import dotenv from "dotenv";
dotenv.config();
const keys = [
  "STRAVA_CLIENT_ID",
  "STRAVA_CLIENT_SECRET",
  "STRAVA_VERIFY_TOKEN",
  "STRAVA_WEBHOOK_CALLBACK_URL",
  "FITCLUB_WEB_URL",
];
for (const k of keys) {
  const v = (process.env[k] || "").trim();
  console.log(`${k}=${v ? "SET" : "MISSING"}`);
}
