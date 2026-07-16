/**
 * Pure mapper: Strava activity JSON → running-activity fields.
 * Sync only Run / VirtualRun / TrailRun (v1).
 */

import { buildSourceKey } from "./running-app";

const RUN_SPORT_TYPES = new Set(["Run", "VirtualRun", "TrailRun"]);

const toNonNegativeInt = (value: unknown) => {
  if (value == null || value === "") return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return Math.round(numberValue);
};

const metersToKm = (meters: unknown) => {
  const value = Number(meters);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round((value / 1000) * 1000) / 1000;
};

const isRunActivity = (activity: Record<string, unknown> | null | undefined) => {
  if (!activity) return false;
  const sport = String(activity.sport_type || activity.type || "");
  return RUN_SPORT_TYPES.has(sport);
};

const isActivityAfterConnectedAt = (
  activity: Record<string, unknown>,
  connectedAt: string | Date | null | undefined,
) => {
  if (!connectedAt) return true;
  const start = activity.start_date || activity.start_date_local;
  if (!start) return false;
  const startMs = new Date(String(start)).getTime();
  const connectedMs = new Date(connectedAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(connectedMs)) return false;
  return startMs >= connectedMs;
};

/**
 * Subset stored in rawPayload to avoid huge streams/maps.
 */
const pickRawPayload = (activity: Record<string, unknown>) => {
  const keys = [
    "id",
    "name",
    "type",
    "sport_type",
    "start_date",
    "start_date_local",
    "timezone",
    "distance",
    "moving_time",
    "elapsed_time",
    "total_elevation_gain",
    "average_heartrate",
    "max_heartrate",
    "average_cadence",
    "average_watts",
    "max_watts",
    "average_speed",
    "max_speed",
    "workout_type",
    "external_id",
    "trainer",
    "commute",
    "manual",
    "private",
    "gear_id",
    "athlete",
  ];

  const subset: Record<string, unknown> = {};
  for (const key of keys) {
    if (activity[key] !== undefined) subset[key] = activity[key];
  }
  return subset;
};

const mapStravaActivityToRunning = (activity: Record<string, unknown>) => {
  const externalId = String(activity.id);
  const performedAt = String(activity.start_date || activity.start_date_local || "");

  return {
    source: "strava" as const,
    externalId,
    sourceKey: buildSourceKey("strava", externalId),
    performedAt,
    type: "trote" as const,
    completed: true,
    distanceKm: metersToKm(activity.distance),
    durationSec: toNonNegativeInt(activity.moving_time ?? activity.elapsed_time),
    notes: activity.name ? String(activity.name).slice(0, 500) : null,
    avgHr: toNonNegativeInt(activity.average_heartrate),
    maxHr: toNonNegativeInt(activity.max_heartrate),
    avgCadence: toNonNegativeInt(activity.average_cadence),
    avgWatts: toNonNegativeInt(activity.average_watts),
    maxWatts: toNonNegativeInt(activity.max_watts),
    rawPayload: pickRawPayload(activity),
  };
};

export {
  RUN_SPORT_TYPES,
  metersToKm,
  isRunActivity,
  isActivityAfterConnectedAt,
  pickRawPayload,
  mapStravaActivityToRunning,
};
