/**
 * running-activity controller
 */

import { factories } from "@strapi/strapi";
import {
  getPayload,
  getAuthenticatedUserWithClub,
  isCoach,
  assertClubAthleteAccess,
  respondAccessError,
  normalizeRunType,
  isValidDateTime,
  isValidDateOnly,
  formatAthlete,
  connectUser,
  getPagination,
  buildSourceKey,
  ACTIVITY_SOURCES,
  toPositiveInteger,
} from "../../../utils/running-app";

const UID = "api::running-activity.running-activity";
const PLANNED_UID = "api::planned-run.planned-run";

const activityPopulate: any = {
  user: true,
  planned_run: {
    fields: ["id", "documentId", "scheduledDate", "type", "title"],
  },
};

const formatActivity = (item) => ({
  id: item.id,
  documentId: item.documentId,
  performedAt: item.performedAt,
  type: item.type,
  completed: item.completed !== false,
  distanceKm: item.distanceKm != null ? Number(item.distanceKm) : null,
  durationSec: item.durationSec ?? null,
  notes: item.notes || null,
  source: item.source || "manual",
  externalId: item.externalId || null,
  avgHr: item.avgHr ?? null,
  maxHr: item.maxHr ?? null,
  avgCadence: item.avgCadence ?? null,
  avgWatts: item.avgWatts ?? null,
  maxWatts: item.maxWatts ?? null,
  user: formatAthlete(item.user),
  plannedRun: item.planned_run
    ? {
        id: item.planned_run.id,
        documentId: item.planned_run.documentId,
        scheduledDate: item.planned_run.scheduledDate,
        type: item.planned_run.type,
        title: item.planned_run.title || null,
      }
    : null,
});

const parseOptionalInt = (ctx, value, field) => {
  if (value === null || value === "" || value === undefined) {
    return { value: value === undefined ? undefined : null };
  }
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    return { error: ctx.badRequest(`${field} must be a non-negative integer`) };
  }
  return { value: numberValue };
};

const parseActivityFields = (
  ctx,
  payload,
  { requireCore = false, allowMetrics = false } = {},
) => {
  const data: any = {};

  if (payload.performedAt !== undefined || requireCore) {
    const value = payload.performedAt;
    if (isValidDateOnly(value)) {
      data.performedAt = `${value}T12:00:00.000Z`;
    } else if (isValidDateTime(value)) {
      data.performedAt = value;
    } else {
      return { error: ctx.badRequest("performedAt must be a valid date or datetime") };
    }
  }

  if (payload.type !== undefined || requireCore) {
    const type = normalizeRunType(payload.type, requireCore ? "trote" : null);
    if (!type) {
      return {
        error: ctx.badRequest(
          "type must be trote, pista, tirada_larga or otro",
        ),
      };
    }
    data.type = type;
  }

  if (payload.completed !== undefined) {
    data.completed = Boolean(payload.completed);
  } else if (requireCore) {
    data.completed = true;
  }

  if (payload.distanceKm !== undefined) {
    if (payload.distanceKm === null || payload.distanceKm === "") {
      data.distanceKm = null;
    } else {
      const km = Number(payload.distanceKm);
      if (Number.isNaN(km) || km < 0) {
        return { error: ctx.badRequest("distanceKm must be a non-negative number") };
      }
      data.distanceKm = km;
    }
  }

  if (payload.durationSec !== undefined) {
    const parsed = parseOptionalInt(ctx, payload.durationSec, "durationSec");
    if (parsed.error) return { error: parsed.error };
    if (parsed.value !== undefined) data.durationSec = parsed.value;
  }

  if (payload.notes !== undefined) {
    data.notes =
      payload.notes == null || payload.notes === ""
        ? null
        : String(payload.notes).trim();
  }

  if (allowMetrics) {
    for (const field of ["avgHr", "maxHr", "avgCadence", "avgWatts", "maxWatts"]) {
      if (payload[field] !== undefined) {
        const parsed = parseOptionalInt(ctx, payload[field], field);
        if (parsed.error) return { error: parsed.error };
        if (parsed.value !== undefined) data[field] = parsed.value;
      }
    }
    if (payload.rawPayload !== undefined) {
      data.rawPayload = payload.rawPayload;
    }
  }

  return { data };
};

const findActivityByIdentifier = async (strapi, identifier) => {
  const raw = String(identifier || "").trim();
  if (!raw) return null;

  const numericId = Number(raw);
  const filters =
    Number.isInteger(numericId) && numericId > 0
      ? { id: numericId }
      : { documentId: raw };

  const items = (await strapi.entityService.findMany(UID, {
    filters,
    limit: 1,
    populate: activityPopulate,
  } as any)) as any[];

  return items[0] || null;
};

const resolvePlannedRun = async (strapi, payload, userId) => {
  const plannedId =
    payload.plannedRunId || payload.planned_run?.id || payload.planned_run;
  if (!plannedId) return { value: null };

  const numericId = toPositiveInteger(plannedId);
  const items = (await strapi.entityService.findMany(PLANNED_UID, {
    filters: numericId
      ? { id: numericId }
      : { documentId: String(plannedId) },
    limit: 1,
    populate: { user: true },
  } as any)) as any[];

  const planned = items[0];
  if (!planned || planned.user?.id !== userId) {
    return { error: true };
  }

  return { value: planned };
};

export default factories.createCoreController(UID, ({ strapi }) => ({
  async appList(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const userId = ctx.query?.userId || authUser.id;
    const access = await assertClubAthleteAccess(strapi, authUser, userId);
    if (access.error) return respondAccessError(ctx, access);

    const from = ctx.query?.from || ctx.query?.startDate;
    const to = ctx.query?.to || ctx.query?.endDate;
    const source = ctx.query?.source
      ? String(ctx.query.source).trim().toLowerCase()
      : null;

    const filters: any = {
      user: { id: { $eq: access.target.id } },
    };

    if (from || to) {
      filters.performedAt = {};
      if (from) {
        const fromValue = String(from);
        filters.performedAt.$gte = isValidDateOnly(fromValue)
          ? `${fromValue}T00:00:00.000Z`
          : fromValue;
      }
      if (to) {
        const toValue = String(to);
        filters.performedAt.$lte = isValidDateOnly(toValue)
          ? `${toValue}T23:59:59.999Z`
          : toValue;
      }
    }

    if (source) {
      if (!ACTIVITY_SOURCES.includes(source as any)) {
        return ctx.badRequest("source must be manual, sheets_import or strava");
      }
      filters.source = { $eq: source };
    }

    const { page, pageSize, start } = getPagination(ctx);
    const [items, total] = await Promise.all([
      strapi.entityService.findMany(UID, {
        filters,
        sort: { performedAt: "desc", id: "desc" },
        start,
        limit: pageSize,
        populate: activityPopulate,
      } as any),
      strapi.entityService.count(UID, { filters } as any),
    ]);

    return ctx.send({
      data: (items as any[]).map(formatActivity),
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize) || 1,
          total,
        },
      },
    });
  },

  async appCreate(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");

    const payload = getPayload(ctx);
    let target = actor;

    if (payload.userId || payload.user) {
      const access = await assertClubAthleteAccess(
        strapi,
        authUser,
        payload.userId || payload.user,
      );
      if (access.error) return respondAccessError(ctx, access);
      if (!access.isSelf && !isCoach(actor)) {
        return ctx.forbidden("Only coaches can create activities for other athletes");
      }
      target = access.target;
    }

    const parsed = parseActivityFields(ctx, payload, {
      requireCore: true,
      allowMetrics: true,
    });
    if (parsed.error) return parsed.error;

    const planned = await resolvePlannedRun(strapi, payload, target.id);
    if (planned.error) {
      return ctx.badRequest("plannedRun does not belong to the athlete");
    }

    const data: any = {
      ...parsed.data,
      user: connectUser(target),
      source: "manual",
      completed: parsed.data.completed !== false,
    };

    if (planned.value) {
      data.planned_run = { connect: [{ id: planned.value.id }] };
    }

    const created = await strapi.entityService.create(UID, {
      data,
      populate: activityPopulate,
    } as any);

    return ctx.send({ data: formatActivity(created) });
  },

  async appUpdate(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const existing = await findActivityByIdentifier(strapi, ctx.params.id);
    if (!existing) return ctx.notFound("Running activity not found");

    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      existing.user?.id,
    );
    if (access.error) return respondAccessError(ctx, access);

    if (existing.source !== "manual" && !isCoach(access.actor)) {
      return ctx.forbidden("Only manual activities can be edited by athletes");
    }

    const payload = getPayload(ctx);
    const parsed = parseActivityFields(ctx, payload, { allowMetrics: true });
    if (parsed.error) return parsed.error;
    if (!Object.keys(parsed.data).length) {
      return ctx.badRequest("No valid fields to update");
    }

    const updated = await strapi.entityService.update(UID, existing.id, {
      data: parsed.data,
      populate: activityPopulate,
    } as any);

    return ctx.send({ data: formatActivity(updated) });
  },

  async appDelete(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const existing = await findActivityByIdentifier(strapi, ctx.params.id);
    if (!existing) return ctx.notFound("Running activity not found");

    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      existing.user?.id,
    );
    if (access.error) return respondAccessError(ctx, access);

    if (existing.source !== "manual" && !isCoach(access.actor)) {
      return ctx.forbidden("Only manual activities can be deleted by athletes");
    }

    await strapi.entityService.delete(UID, existing.id);
    return ctx.send({
      data: { id: existing.id, documentId: existing.documentId },
    });
  },

  async appUpsertImport(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor || !isCoach(actor)) {
      return ctx.forbidden("Only coaches can import running activities");
    }

    const payload = getPayload(ctx);
    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      payload.userId || payload.user,
    );
    if (access.error) return respondAccessError(ctx, access);

    const externalId = String(payload.externalId || "").trim();
    if (!externalId) {
      return ctx.badRequest("externalId is required for import");
    }

    const source = String(payload.source || "sheets_import").trim().toLowerCase();
    if (!ACTIVITY_SOURCES.includes(source as any) || source === "manual") {
      return ctx.badRequest("source must be sheets_import or strava for upsert");
    }

    const parsed = parseActivityFields(ctx, payload, {
      requireCore: true,
      allowMetrics: true,
    });
    if (parsed.error) return parsed.error;

    const sourceKey = buildSourceKey(source, externalId);
    const existing = (await strapi.entityService.findMany(UID, {
      filters: { sourceKey: { $eq: sourceKey } },
      limit: 1,
      populate: activityPopulate,
    } as any)) as any[];

    const data: any = {
      ...parsed.data,
      user: connectUser(access.target),
      source,
      externalId,
      sourceKey,
      completed: parsed.data.completed !== false,
    };

    const saved = existing[0]
      ? await strapi.entityService.update(UID, existing[0].id, {
          data,
          populate: activityPopulate,
        } as any)
      : await strapi.entityService.create(UID, {
          data,
          populate: activityPopulate,
        } as any);

    return ctx.send({
      data: formatActivity(saved),
      meta: { upserted: existing[0] ? "updated" : "created" },
    });
  },
}));
