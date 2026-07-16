/**
 * Strava API client + sync: refresh tokens, fetch activity, upsert/delete running-activity.
 */

import { connectUser, buildSourceKey } from "../../../utils/running-app";
import {
  expiresAtToIso,
  refreshAccessToken,
  revokeAccessToken,
} from "../../../utils/strava-oauth";
import {
  isActivityAfterConnectedAt,
  isRunActivity,
  mapStravaActivityToRunning,
} from "../../../utils/strava-mapper";

const CONNECTION_UID = "api::strava-connection.strava-connection";
const ACTIVITY_UID = "api::running-activity.running-activity";
const STRAVA_API = "https://www.strava.com/api/v3";

const REFRESH_SKEW_MS = 60 * 1000;

type StrapiLike = {
  entityService: {
    findMany: (uid: string, params: any) => Promise<any>;
    create: (uid: string, params: any) => Promise<any>;
    update: (uid: string, id: number | string, params: any) => Promise<any>;
    delete: (uid: string, id: number | string) => Promise<any>;
  };
  log: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
};

const findConnectionByAthleteId = async (
  strapi: StrapiLike,
  stravaAthleteId: string | number,
) => {
  const rows = (await strapi.entityService.findMany(CONNECTION_UID, {
    filters: {
      stravaAthleteId: { $eq: String(stravaAthleteId) },
      active: { $eq: true },
    },
    limit: 1,
    populate: { user: true },
  } as any)) as any[];

  return rows[0] || null;
};

const findConnectionByUserId = async (strapi: StrapiLike, userId: number) => {
  const rows = (await strapi.entityService.findMany(CONNECTION_UID, {
    filters: { user: { id: { $eq: userId } } },
    limit: 1,
    populate: { user: true },
  } as any)) as any[];

  return rows[0] || null;
};

/**
 * Returns a valid access token, refreshing and persisting when near expiry.
 */
const ensureAccessToken = async (strapi: StrapiLike, connection: any) => {
  const expiresAt = connection.expiresAt
    ? new Date(connection.expiresAt).getTime()
    : 0;
  const needsRefresh = !expiresAt || expiresAt - Date.now() < REFRESH_SKEW_MS;

  if (!needsRefresh && connection.accessToken) {
    return connection.accessToken as string;
  }

  if (!connection.refreshToken) {
    throw new Error("Strava refresh token missing");
  }

  const tokens = await refreshAccessToken(connection.refreshToken);
  const updated = await strapi.entityService.update(CONNECTION_UID, connection.id, {
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: expiresAtToIso(tokens.expires_at),
      scopes: tokens.scope || connection.scopes || null,
    },
    populate: { user: true },
  } as any);

  return updated.accessToken as string;
};

const stravaFetch = async (accessToken: string, path: string) => {
  const response = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) return null;

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (json as any)?.message || `HTTP ${response.status}`;
    throw new Error(`Strava API ${path}: ${message}`);
  }

  return json as Record<string, unknown>;
};

const fetchActivityDetail = async (accessToken: string, activityId: string | number) =>
  stravaFetch(accessToken, `/activities/${activityId}`);

const upsertRunningFromStrava = async (
  strapi: StrapiLike,
  connection: any,
  activity: Record<string, unknown>,
) => {
  if (!isRunActivity(activity)) {
    return { skipped: true, reason: "not_run" };
  }

  if (!isActivityAfterConnectedAt(activity, connection.connectedAt)) {
    return { skipped: true, reason: "before_connectedAt" };
  }

  const user = connection.user;
  if (!user?.id) {
    return { skipped: true, reason: "missing_user" };
  }

  const mapped = mapStravaActivityToRunning(activity);
  if (!mapped.performedAt || Number.isNaN(new Date(mapped.performedAt).getTime())) {
    return { skipped: true, reason: "invalid_date" };
  }

  const existing = (await strapi.entityService.findMany(ACTIVITY_UID, {
    filters: { sourceKey: { $eq: mapped.sourceKey } },
    limit: 1,
  } as any)) as any[];

  const data: any = {
    ...mapped,
    user: connectUser(user),
  };

  const saved = existing[0]
    ? await strapi.entityService.update(ACTIVITY_UID, existing[0].id, { data } as any)
    : await strapi.entityService.create(ACTIVITY_UID, { data } as any);

  await strapi.entityService.update(CONNECTION_UID, connection.id, {
    data: { lastSyncedAt: new Date().toISOString() },
  } as any);

  return {
    skipped: false,
    upserted: existing[0] ? "updated" : "created",
    activityId: saved.id,
    sourceKey: mapped.sourceKey,
  };
};

const deleteRunningByStravaId = async (
  strapi: StrapiLike,
  stravaActivityId: string | number,
) => {
  const sourceKey = buildSourceKey("strava", String(stravaActivityId));
  const existing = (await strapi.entityService.findMany(ACTIVITY_UID, {
    filters: { sourceKey: { $eq: sourceKey } },
    limit: 1,
  } as any)) as any[];

  if (!existing[0]) {
    return { deleted: false, sourceKey };
  }

  await strapi.entityService.delete(ACTIVITY_UID, existing[0].id);
  return { deleted: true, sourceKey, id: existing[0].id };
};

const handleWebhookEvent = async (strapi: StrapiLike, event: any) => {
  const objectType = String(event?.object_type || "");
  const aspectType = String(event?.aspect_type || "");
  const ownerId = event?.owner_id;
  const objectId = event?.object_id;

  if (objectType === "athlete") {
    if (event?.updates?.authorized === "false" || event?.updates?.authorized === false) {
      const connection = await findConnectionByAthleteId(strapi, ownerId);
      if (connection) {
        await strapi.entityService.update(CONNECTION_UID, connection.id, {
          data: {
            active: false,
            accessToken: "revoked",
            refreshToken: "revoked",
          },
        } as any);
        return { handled: true, action: "athlete_deauthorized" };
      }
    }
    return { handled: true, action: "athlete_ignored" };
  }

  if (objectType !== "activity") {
    return { handled: true, action: "ignored_object_type" };
  }

  const connection = await findConnectionByAthleteId(strapi, ownerId);
  if (!connection) {
    strapi.log.info(`[strava] webhook: no active connection for athlete ${ownerId}`);
    return { handled: true, action: "no_connection" };
  }

  if (aspectType === "delete") {
    const result = await deleteRunningByStravaId(strapi, objectId);
    await strapi.entityService.update(CONNECTION_UID, connection.id, {
      data: { lastSyncedAt: new Date().toISOString() },
    } as any);
    return { handled: true, action: "activity_deleted", ...result };
  }

  if (aspectType !== "create" && aspectType !== "update") {
    return { handled: true, action: "ignored_aspect" };
  }

  const accessToken = await ensureAccessToken(strapi, connection);
  const activity = await fetchActivityDetail(accessToken, objectId);

  if (!activity) {
    return { handled: true, action: "activity_not_found" };
  }

  const result = await upsertRunningFromStrava(strapi, connection, activity);
  return { handled: true, action: "activity_upsert", ...result };
};

const deactivateConnection = async (
  strapi: StrapiLike,
  connection: any,
  { revoke = true } = {},
) => {
  if (revoke && connection.accessToken && connection.accessToken !== "revoked") {
    await revokeAccessToken(connection.accessToken);
  }

  return strapi.entityService.update(CONNECTION_UID, connection.id, {
    data: {
      active: false,
      accessToken: "revoked",
      refreshToken: "revoked",
    },
    populate: { user: true },
  } as any);
};

export {
  CONNECTION_UID,
  ACTIVITY_UID,
  findConnectionByAthleteId,
  findConnectionByUserId,
  ensureAccessToken,
  fetchActivityDetail,
  upsertRunningFromStrava,
  deleteRunningByStravaId,
  handleWebhookEvent,
  deactivateConnection,
};
