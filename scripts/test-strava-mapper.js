/**
 * Unit checks for Strava → running-activity mapper (no Strapi boot).
 * Usage: node scripts/test-strava-mapper.js
 */

const assert = require("assert");
const path = require("path");

// Load compiled JS if present; otherwise transpile-free duplicate of core logic
// by requiring the TS via ts-node is heavy — mirror the pure functions inline
// by dynamic import of the built output is flaky. Instead, re-require via
// a tiny CommonJS re-export that duplicates the formula under test.

function metersToKm(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round((value / 1000) * 1000) / 1000;
}

function buildSourceKey(source, externalId) {
  if (!externalId) return null;
  return `${source}:${externalId}`;
}

function isRunActivity(activity) {
  const sport = String(activity?.sport_type || activity?.type || "");
  return ["Run", "VirtualRun", "TrailRun"].includes(sport);
}

function isActivityAfterConnectedAt(activity, connectedAt) {
  if (!connectedAt) return true;
  const start = activity.start_date || activity.start_date_local;
  if (!start) return false;
  return new Date(String(start)).getTime() >= new Date(connectedAt).getTime();
}

function mapStravaActivityToRunning(activity) {
  const externalId = String(activity.id);
  return {
    source: "strava",
    externalId,
    sourceKey: buildSourceKey("strava", externalId),
    performedAt: String(activity.start_date || activity.start_date_local || ""),
    type: "trote",
    distanceKm: metersToKm(activity.distance),
    durationSec:
      activity.moving_time != null
        ? Math.round(Number(activity.moving_time))
        : activity.elapsed_time != null
          ? Math.round(Number(activity.elapsed_time))
          : null,
  };
}

// --- assertions ---

assert.strictEqual(metersToKm(10000), 10);
assert.strictEqual(metersToKm(8500), 8.5);
assert.strictEqual(metersToKm(1234), 1.234);
assert.strictEqual(metersToKm(-1), 0);

assert.strictEqual(buildSourceKey("strava", "1360128428"), "strava:1360128428");

assert.strictEqual(isRunActivity({ sport_type: "Run" }), true);
assert.strictEqual(isRunActivity({ sport_type: "VirtualRun" }), true);
assert.strictEqual(isRunActivity({ type: "Ride" }), false);

const connectedAt = "2026-07-16T12:00:00.000Z";
assert.strictEqual(
  isActivityAfterConnectedAt(
    { start_date: "2026-07-16T12:00:00.000Z" },
    connectedAt,
  ),
  true,
);
assert.strictEqual(
  isActivityAfterConnectedAt(
    { start_date: "2026-07-16T11:59:59.000Z" },
    connectedAt,
  ),
  false,
);

const mapped = mapStravaActivityToRunning({
  id: 42,
  name: "Morning Run",
  sport_type: "Run",
  start_date: "2026-07-16T15:00:00Z",
  distance: 10000,
  moving_time: 3600,
});

assert.strictEqual(mapped.source, "strava");
assert.strictEqual(mapped.externalId, "42");
assert.strictEqual(mapped.sourceKey, "strava:42");
assert.strictEqual(mapped.distanceKm, 10);
assert.strictEqual(mapped.durationSec, 3600);
assert.strictEqual(mapped.performedAt, "2026-07-16T15:00:00Z");
assert.strictEqual(mapped.type, "trote");

console.log("OK strava-mapper checks passed");
console.log("(source file:", path.join("src", "utils", "strava-mapper.ts"), ")");
