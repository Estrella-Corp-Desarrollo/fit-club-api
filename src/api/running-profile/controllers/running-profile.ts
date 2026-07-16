/**
 * running-profile controller
 */

import { factories } from "@strapi/strapi";
import {
  getPayload,
  getAuthenticatedUserWithClub,
  isCoach,
  assertClubAthleteAccess,
  respondAccessError,
  normalizeOptionalPace,
  normalizePhase,
  isValidDateOnly,
  formatAthlete,
  connectUser,
  findUserByIdentifier,
  USER_UID,
} from "../../../utils/running-app";
import {
  aggregatePlanRows,
  aggregateRawRows,
  buildRanking,
  normalizeName as rankingNormalizeName,
  profileToAthleteInfo,
} from "../../../utils/running-ranking";

const UID = "api::running-profile.running-profile";
const PLANNED_RUN_UID = "api::planned-run.planned-run";
const ACTIVITY_UID = "api::running-activity.running-activity";

const profilePopulate: any = {
  user: {
    populate: {
      club: true,
    },
  },
};

const formatProfile = (profile) => ({
  id: profile.id,
  documentId: profile.documentId,
  phase: profile.phase || "temporada",
  thresholdPace: profile.thresholdPace || null,
  easyPace: profile.easyPace || null,
  intervalPace: profile.intervalPace || null,
  seriesPace: profile.seriesPace || null,
  group: profile.group || null,
  trackDays: profile.trackDays ?? null,
  trackMode: profile.trackMode || null,
  event: profile.event || null,
  eventDate: profile.eventDate || null,
  goal: profile.goal || null,
  notes: profile.notes || null,
  user: formatAthlete(profile.user),
});

const parseProfileFields = (ctx, payload) => {
  const data: any = {};

  if (payload.phase !== undefined) {
    const phase = normalizePhase(payload.phase, null);
    if (!phase) {
      return { error: ctx.badRequest("phase must be temporada, pretemporada or tapering") };
    }
    data.phase = phase;
  }

  for (const field of ["thresholdPace", "easyPace", "intervalPace", "seriesPace"]) {
    if (payload[field] !== undefined) {
      const pace = normalizeOptionalPace(payload[field]);
      if (pace.error) {
        return {
          error: ctx.badRequest(
            `${field} must use m:ss or m:ss-m:ss format`,
          ),
        };
      }
      data[field] = pace.value;
    }
  }

  for (const field of ["group", "trackMode", "event", "goal", "notes"]) {
    if (payload[field] !== undefined) {
      data[field] =
        payload[field] == null || payload[field] === ""
          ? null
          : String(payload[field]).trim();
    }
  }

  if (payload.trackDays !== undefined) {
    if (payload.trackDays === null || payload.trackDays === "") {
      data.trackDays = null;
    } else {
      const days = Number(payload.trackDays);
      if (!Number.isInteger(days) || days < 0 || days > 7) {
        return { error: ctx.badRequest("trackDays must be an integer between 0 and 7") };
      }
      data.trackDays = days;
    }
  }

  if (payload.eventDate !== undefined) {
    if (payload.eventDate === null || payload.eventDate === "") {
      data.eventDate = null;
    } else if (!isValidDateOnly(payload.eventDate)) {
      return { error: ctx.badRequest("eventDate must use YYYY-MM-DD") };
    } else {
      data.eventDate = payload.eventDate;
    }
  }

  return { data };
};

const findProfileForUser = async (strapi, userId) => {
  const profiles = (await strapi.entityService.findMany(UID, {
    filters: { user: { id: { $eq: userId } } },
    limit: 1,
    populate: profilePopulate,
  } as any)) as any[];

  return profiles[0] || null;
};

const upsertProfile = async (strapi, user, fields) => {
  const existing = await findProfileForUser(strapi, user.id);

  if (existing) {
    return strapi.entityService.update(UID, existing.id, {
      data: fields,
      populate: profilePopulate,
    } as any);
  }

  return strapi.entityService.create(UID, {
    data: {
      ...fields,
      user: connectUser(user),
      phase: fields.phase || "temporada",
    },
    populate: profilePopulate,
  } as any);
};

export default factories.createCoreController(UID, ({ strapi }) => ({
  /**
   * Club-scoped team ranking (planned-runs + activities + profiles).
   * Shape compatible with FitClubWeb getTeamRanking().
   */
  async appRanking(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");

    const clubId = actor.club?.id;
    if (!clubId) {
      return ctx.badRequest("Club is required to view running ranking");
    }

    const members = await strapi.db.query(USER_UID).findMany({
      where: { club: { id: clubId } },
      populate: { running_profile: true, role: true },
    });

    const roster = members.filter((member) => {
      const role = String(
        member.role?.type || member.role?.name || "",
      ).toLowerCase();
      // Coaches only appear if they have a running profile (athletes always)
      if (role === "coach" && !member.running_profile) return false;
      return true;
    });

    const memberIds = roster.map((member) => member.id);
    const nameByUserId = new Map<number, string>();
    const athletes: Record<string, ReturnType<typeof profileToAthleteInfo>> = {};

    for (const member of roster) {
      const info = profileToAthleteInfo(member, member.running_profile);
      nameByUserId.set(member.id, info.name);
      athletes[rankingNormalizeName(info.name)] = info;
    }

    if (!memberIds.length) {
      return ctx.send({
        data: buildRanking({ athletes: {}, planRows: [], rawRows: [] }),
      });
    }

    const [plannedRuns, activities] = await Promise.all([
      strapi.db.query(PLANNED_RUN_UID).findMany({
        where: { user: { id: { $in: memberIds } } },
        populate: { user: true },
      }),
      strapi.db.query(ACTIVITY_UID).findMany({
        where: { user: { id: { $in: memberIds } } },
        populate: { user: true },
      }),
    ]);

    const planRows = aggregatePlanRows(plannedRuns, nameByUserId);
    const rawRows = aggregateRawRows(activities, nameByUserId);

    return ctx.send({
      data: buildRanking({ athletes, planRows, rawRows }),
    });
  },

  async appGetMine(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const profile = await findProfileForUser(strapi, authUser.id);
    return ctx.send({
      data: profile ? formatProfile(profile) : null,
    });
  },

  async appGetByUser(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const access = await assertClubAthleteAccess(
      strapi,
      authUser,
      ctx.params.userId,
    );
    if (access.error) return respondAccessError(ctx, access);

    const profile = await findProfileForUser(strapi, access.target.id);
    return ctx.send({
      data: profile ? formatProfile(profile) : null,
    });
  },

  async appUpsertByUser(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");

    const payload = getPayload(ctx);
    const paramUserId = ctx.params.userId;
    const targetIdentifier =
      !paramUserId || paramUserId === "me"
        ? payload.userId || payload.user || actor.id
        : paramUserId;

    const isSelf =
      String(targetIdentifier) === String(actor.id) ||
      String(targetIdentifier) === String(actor.documentId);

    let target = actor;

    if (!isSelf) {
      if (!isCoach(actor)) {
        return ctx.forbidden("Only coaches can update other athletes");
      }
      if (!actor.club?.id) {
        return ctx.badRequest("Coach club is required");
      }

      const found = await findUserByIdentifier(strapi, targetIdentifier);
      if (!found) return ctx.notFound("Athlete not found");
      if (found.club?.id !== actor.club.id) {
        return ctx.forbidden("Athlete is not in your club");
      }
      target = found;
    } else if (!isCoach(actor) && Object.keys(payload).some((key) =>
      ["thresholdPace", "easyPace", "intervalPace", "seriesPace", "phase", "group", "trackDays", "trackMode"].includes(key)
    )) {
      // Athletes may update goal/event notes; pace/phase owned by coach
      const athleteAllowed = ["event", "eventDate", "goal", "notes"];
      const forbidden = Object.keys(payload).filter(
        (key) => !athleteAllowed.includes(key) && key !== "userId" && key !== "user",
      );
      if (forbidden.length) {
        return ctx.forbidden(
          "Athletes can only update event, eventDate, goal and notes on their running profile",
        );
      }
    }

    const parsed = parseProfileFields(ctx, payload);
    if (parsed.error) return parsed.error;

    if (!Object.keys(parsed.data).length) {
      return ctx.badRequest("No valid fields to update");
    }

    const profile = await upsertProfile(strapi, target, parsed.data);
    return ctx.send({ data: formatProfile(profile) });
  },
}));
