/**
 * planned-run controller
 */

import { factories } from "@strapi/strapi";
import {
  getPayload,
  getAuthenticatedUserWithClub,
  isCoach,
  assertClubAthleteAccess,
  respondAccessError,
  normalizeOptionalPace,
  normalizeRunType,
  isValidDateOnly,
  formatAthlete,
  connectUser,
  getPagination,
  buildSourceKey,
  PLANNED_STATUSES,
  toPositiveInteger,
} from "../../../utils/running-app";

const UID = "api::planned-run.planned-run";
const BLOCK_UID = "api::training-block.training-block";

const plannedPopulate: any = {
  user: true,
  training_block: {
    fields: ["id", "documentId", "startDate", "endDate", "phase"],
  },
};

const formatPlannedRun = (item) => ({
  id: item.id,
  documentId: item.documentId,
  scheduledDate: item.scheduledDate,
  type: item.type,
  distanceKm: item.distanceKm != null ? Number(item.distanceKm) : null,
  title: item.title || null,
  notes: item.notes || null,
  targetPace: item.targetPace || null,
  status: item.status || "planned",
  source: item.source || "manual",
  externalId: item.externalId || null,
  user: formatAthlete(item.user),
  trainingBlock: item.training_block
    ? {
        id: item.training_block.id,
        documentId: item.training_block.documentId,
        startDate: item.training_block.startDate,
        endDate: item.training_block.endDate,
        phase: item.training_block.phase || null,
      }
    : null,
});

const parsePlannedFields = (ctx, payload, { requireDate = false } = {}) => {
  const data: any = {};

  if (payload.scheduledDate !== undefined || requireDate) {
    if (!isValidDateOnly(payload.scheduledDate)) {
      return { error: ctx.badRequest("scheduledDate must use YYYY-MM-DD") };
    }
    data.scheduledDate = payload.scheduledDate;
  }

  if (payload.type !== undefined || requireDate) {
    const type = normalizeRunType(payload.type, requireDate ? "trote" : null);
    if (!type) {
      return {
        error: ctx.badRequest(
          "type must be trote, pista, tirada_larga or otro",
        ),
      };
    }
    data.type = type;
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

  if (payload.title !== undefined) {
    data.title =
      payload.title == null || payload.title === ""
        ? null
        : String(payload.title).trim();
  }

  if (payload.notes !== undefined) {
    data.notes =
      payload.notes == null || payload.notes === ""
        ? null
        : String(payload.notes).trim();
  }

  if (payload.targetPace !== undefined) {
    const pace = normalizeOptionalPace(payload.targetPace);
    if (pace.error) {
      return {
        error: ctx.badRequest("targetPace must use m:ss or m:ss-m:ss format"),
      };
    }
    data.targetPace = pace.value;
  }

  if (payload.status !== undefined) {
    const status = String(payload.status).trim().toLowerCase();
    if (!PLANNED_STATUSES.includes(status as any)) {
      return {
        error: ctx.badRequest("status must be planned, done or skipped"),
      };
    }
    data.status = status;
  }

  return { data };
};

const findPlannedByIdentifier = async (strapi, identifier) => {
  const raw = String(identifier || "").trim();
  if (!raw) return null;

  const numericId = Number(raw);
  const filters = Number.isInteger(numericId) && numericId > 0
    ? { id: numericId }
    : { documentId: raw };

  const items = (await strapi.entityService.findMany(UID, {
    filters,
    limit: 1,
    populate: plannedPopulate,
  } as any)) as any[];

  return items[0] || null;
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
    const filters: any = {
      user: { id: { $eq: access.target.id } },
    };

    if (from || to) {
      filters.scheduledDate = {};
      if (from) {
        if (!isValidDateOnly(String(from))) {
          return ctx.badRequest("from must use YYYY-MM-DD");
        }
        filters.scheduledDate.$gte = String(from);
      }
      if (to) {
        if (!isValidDateOnly(String(to))) {
          return ctx.badRequest("to must use YYYY-MM-DD");
        }
        filters.scheduledDate.$lte = String(to);
      }
    }

    const { page, pageSize, start } = getPagination(ctx);
    const [items, total] = await Promise.all([
      strapi.entityService.findMany(UID, {
        filters,
        sort: { scheduledDate: "asc", id: "asc" },
        start,
        limit: pageSize,
        populate: plannedPopulate,
      } as any),
      strapi.entityService.count(UID, { filters } as any),
    ]);

    return ctx.send({
      data: (items as any[]).map(formatPlannedRun),
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
    if (!isCoach(actor)) {
      return ctx.forbidden("Only coaches can create planned runs");
    }
    if (!actor.club?.id) {
      return ctx.badRequest("Coach club is required");
    }

    const payload = getPayload(ctx);
    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      payload.userId || payload.user,
    );
    if (access.error) return respondAccessError(ctx, access);
    if (access.isSelf && !payload.userId && !payload.user) {
      return ctx.badRequest("userId is required");
    }

    const parsed = parsePlannedFields(ctx, payload, { requireDate: true });
    if (parsed.error) return parsed.error;

    const data: any = {
      ...parsed.data,
      user: connectUser(access.target),
      status: parsed.data.status || "planned",
      source: "manual",
    };

    if (payload.trainingBlockId || payload.training_block) {
      const blockId =
        payload.trainingBlockId ||
        payload.training_block?.id ||
        payload.training_block;
      const numericId = toPositiveInteger(blockId);
      const blocks = (await strapi.entityService.findMany(BLOCK_UID, {
        filters: numericId
          ? { id: numericId }
          : { documentId: String(blockId) },
        limit: 1,
        populate: { user: true },
      } as any)) as any[];
      const block = blocks[0];
      if (!block || block.user?.id !== access.target.id) {
        return ctx.badRequest("trainingBlock does not belong to the athlete");
      }
      data.training_block = { connect: [{ id: block.id }] };
    }

    const created = await strapi.entityService.create(UID, {
      data,
      populate: plannedPopulate,
    } as any);

    return ctx.send({ data: formatPlannedRun(created) });
  },

  async appBulkCreate(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");
    if (!isCoach(actor)) {
      return ctx.forbidden("Only coaches can create planned runs");
    }

    const payload = getPayload(ctx);
    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      payload.userId || payload.user,
    );
    if (access.error) return respondAccessError(ctx, access);

    const items = Array.isArray(payload.items) ? payload.items : null;
    if (!items?.length) {
      return ctx.badRequest("items array is required");
    }

    const created = [];
    for (const item of items) {
      const parsed = parsePlannedFields(ctx, item, { requireDate: true });
      if (parsed.error) return parsed.error;

      const row = await strapi.entityService.create(UID, {
        data: {
          ...parsed.data,
          user: connectUser(access.target),
          status: parsed.data.status || "planned",
          source: "manual",
        },
        populate: plannedPopulate,
      } as any);
      created.push(formatPlannedRun(row));
    }

    return ctx.send({ data: created });
  },

  async appUpdate(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");
    if (!isCoach(actor)) {
      return ctx.forbidden("Only coaches can update planned runs");
    }

    const existing = await findPlannedByIdentifier(strapi, ctx.params.id);
    if (!existing) return ctx.notFound("Planned run not found");

    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      existing.user?.id,
    );
    if (access.error) return respondAccessError(ctx, access);

    const payload = getPayload(ctx);
    const parsed = parsePlannedFields(ctx, payload);
    if (parsed.error) return parsed.error;
    if (!Object.keys(parsed.data).length) {
      return ctx.badRequest("No valid fields to update");
    }

    const updated = await strapi.entityService.update(UID, existing.id, {
      data: parsed.data,
      populate: plannedPopulate,
    } as any);

    return ctx.send({ data: formatPlannedRun(updated) });
  },

  async appDelete(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");
    if (!isCoach(actor)) {
      return ctx.forbidden("Only coaches can delete planned runs");
    }

    const existing = await findPlannedByIdentifier(strapi, ctx.params.id);
    if (!existing) return ctx.notFound("Planned run not found");

    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      existing.user?.id,
    );
    if (access.error) return respondAccessError(ctx, access);

    await strapi.entityService.delete(UID, existing.id);
    return ctx.send({ data: { id: existing.id, documentId: existing.documentId } });
  },

  async appUpsertImport(ctx) {
    // Internal/admin helper for sheets import idempotency
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor || !isCoach(actor)) {
      return ctx.forbidden("Only coaches can import planned runs");
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

    const parsed = parsePlannedFields(ctx, payload, { requireDate: true });
    if (parsed.error) return parsed.error;

    const sourceKey = buildSourceKey("sheets_import", externalId);
    const existing = (await strapi.entityService.findMany(UID, {
      filters: { sourceKey: { $eq: sourceKey } },
      limit: 1,
      populate: plannedPopulate,
    } as any)) as any[];

    const data = {
      ...parsed.data,
      user: connectUser(access.target),
      source: "sheets_import",
      externalId,
      sourceKey,
      status: parsed.data.status || "planned",
    };

    const saved = existing[0]
      ? await strapi.entityService.update(UID, existing[0].id, {
          data,
          populate: plannedPopulate,
        } as any)
      : await strapi.entityService.create(UID, {
          data,
          populate: plannedPopulate,
        } as any);

    return ctx.send({
      data: formatPlannedRun(saved),
      meta: { upserted: existing[0] ? "updated" : "created" },
    });
  },
}));
