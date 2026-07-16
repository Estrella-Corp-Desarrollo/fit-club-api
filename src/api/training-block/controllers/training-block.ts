/**
 * training-block controller
 */

import { factories } from "@strapi/strapi";
import {
  getPayload,
  getAuthenticatedUserWithClub,
  isCoach,
  assertClubAthleteAccess,
  respondAccessError,
  normalizePhase,
  isValidDateOnly,
  formatAthlete,
  connectUser,
  getPagination,
} from "../../../utils/running-app";

const UID = "api::training-block.training-block";

const blockPopulate: any = {
  user: true,
  planned_runs: {
    fields: ["id", "documentId", "scheduledDate", "type", "distanceKm", "status"],
  },
};

const formatBlock = (block) => ({
  id: block.id,
  documentId: block.documentId,
  startDate: block.startDate,
  endDate: block.endDate,
  phase: block.phase || null,
  notes: block.notes || null,
  user: formatAthlete(block.user),
  plannedRunsCount: Array.isArray(block.planned_runs)
    ? block.planned_runs.length
    : undefined,
});

const parseBlockFields = (ctx, payload, { requireDates = false } = {}) => {
  const data: any = {};

  if (payload.startDate !== undefined || requireDates) {
    if (!isValidDateOnly(payload.startDate)) {
      return { error: ctx.badRequest("startDate must use YYYY-MM-DD") };
    }
    data.startDate = payload.startDate;
  }

  if (payload.endDate !== undefined || requireDates) {
    if (!isValidDateOnly(payload.endDate)) {
      return { error: ctx.badRequest("endDate must use YYYY-MM-DD") };
    }
    data.endDate = payload.endDate;
  }

  const start = data.startDate || payload.startDate;
  const end = data.endDate || payload.endDate;
  if (start && end && start > end) {
    return { error: ctx.badRequest("startDate must be on or before endDate") };
  }

  if (payload.phase !== undefined) {
    if (payload.phase === null || payload.phase === "") {
      data.phase = null;
    } else {
      const phase = normalizePhase(payload.phase, null);
      if (!phase) {
        return {
          error: ctx.badRequest(
            "phase must be temporada, pretemporada or tapering",
          ),
        };
      }
      data.phase = phase;
    }
  }

  if (payload.notes !== undefined) {
    data.notes =
      payload.notes == null || payload.notes === ""
        ? null
        : String(payload.notes).trim();
  }

  return { data };
};

const findBlockByIdentifier = async (strapi, identifier) => {
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
    populate: blockPopulate,
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

    const { page, pageSize, start } = getPagination(ctx);
    const filters = { user: { id: { $eq: access.target.id } } };

    const [items, total] = await Promise.all([
      strapi.entityService.findMany(UID, {
        filters,
        sort: { startDate: "desc" },
        start,
        limit: pageSize,
        populate: blockPopulate,
      } as any),
      strapi.entityService.count(UID, { filters } as any),
    ]);

    return ctx.send({
      data: (items as any[]).map(formatBlock),
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
      return ctx.forbidden("Only coaches can create training blocks");
    }

    const payload = getPayload(ctx);
    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      payload.userId || payload.user,
    );
    if (access.error) return respondAccessError(ctx, access);

    const parsed = parseBlockFields(ctx, payload, { requireDates: true });
    if (parsed.error) return parsed.error;

    const created = await strapi.entityService.create(UID, {
      data: {
        ...parsed.data,
        user: connectUser(access.target),
      },
      populate: blockPopulate,
    } as any);

    return ctx.send({ data: formatBlock(created) });
  },

  async appUpdate(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");
    if (!isCoach(actor)) {
      return ctx.forbidden("Only coaches can update training blocks");
    }

    const existing = await findBlockByIdentifier(strapi, ctx.params.id);
    if (!existing) return ctx.notFound("Training block not found");

    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      existing.user?.id,
    );
    if (access.error) return respondAccessError(ctx, access);

    const payload = getPayload(ctx);
    const parsed = parseBlockFields(ctx, {
      ...payload,
      startDate: payload.startDate ?? existing.startDate,
      endDate: payload.endDate ?? existing.endDate,
    });
    if (parsed.error) return parsed.error;
    if (!Object.keys(parsed.data).length) {
      return ctx.badRequest("No valid fields to update");
    }

    const updated = await strapi.entityService.update(UID, existing.id, {
      data: parsed.data,
      populate: blockPopulate,
    } as any);

    return ctx.send({ data: formatBlock(updated) });
  },

  async appDelete(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");
    if (!isCoach(actor)) {
      return ctx.forbidden("Only coaches can delete training blocks");
    }

    const existing = await findBlockByIdentifier(strapi, ctx.params.id);
    if (!existing) return ctx.notFound("Training block not found");

    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      existing.user?.id,
    );
    if (access.error) return respondAccessError(ctx, access);

    await strapi.entityService.delete(UID, existing.id);
    return ctx.send({
      data: { id: existing.id, documentId: existing.documentId },
    });
  },
}));
