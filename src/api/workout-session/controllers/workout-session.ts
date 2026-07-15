/**
 * workout-session controller
 */

import { factories } from "@strapi/strapi";

const WORKOUT_SESSION_UID = "api::workout-session.workout-session";
const WORKOUT_UID = "api::workout.workout";
const USER_UID = "plugin::users-permissions.user";
const COACH_ROLE = "coach";

const workoutPopulate: any = {
  exercises: {
    populate: {
      club: true,
    },
  },
  group_of_athletes: {
    populate: {
      club: true,
      users: {
        populate: {
          avatar: {
            fields: ["url"],
          },
          club: true,
        },
      },
    },
  },
  user: {
    populate: {
      avatar: {
        fields: ["url"],
      },
      club: true,
    },
  },
  workout_type: true,
};

const sessionPopulate: any = {
  user: {
    populate: {
      avatar: {
        fields: ["url"],
      },
      club: true,
    },
  },
  workout: {
    fields: ["id", "documentId", "name"],
  },
};

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const getAuthenticatedUserWithClub = async (strapi, userId) =>
  strapi.db.query(USER_UID).findOne({
    where: {
      id: userId,
    },
    populate: {
      club: true,
      role: true,
    },
  });

const isCoach = (user) =>
  String(user?.role?.name || user?.role?.type || "").toLowerCase() ===
  COACH_ROLE;

const toPositiveInteger = (value) => {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const getPagination = (ctx) => {
  const page = Math.max(
    Number(ctx.query?.pagination?.page || ctx.query?.page || 1),
    1,
  );
  const pageSize = Math.min(
    Math.max(
      Number(ctx.query?.pagination?.pageSize || ctx.query?.pageSize || 10),
      1,
    ),
    100,
  );

  return {
    page,
    pageSize,
    start: (page - 1) * pageSize,
  };
};

const formatAthlete = (athlete) => ({
  id: athlete.id,
  documentId: athlete.documentId,
  name: athlete.name,
  lastname: athlete.lastname,
  email: athlete.email,
  username: athlete.username,
});

const formatSession = (session, { includeUser = false } = {}) => ({
  id: session.id,
  documentId: session.documentId,
  completedAt: session.completedAt,
  perceivedEffort: session.perceivedEffort,
  notes: session.notes || "",
  ...(includeUser && session.user ? { user: formatAthlete(session.user) } : {}),
});

const getWorkoutByIdentifier = async (strapi, identifier) => {
  const workoutIdentifier = String(identifier || "").trim();

  if (!workoutIdentifier) return null;

  const numericId = Number(workoutIdentifier);
  const filters = Number.isInteger(numericId)
    ? {
        id: numericId,
      }
    : {
        documentId: workoutIdentifier,
      };

  const workouts = (await strapi.entityService.findMany(WORKOUT_UID, {
    filters,
    limit: 1,
    populate: workoutPopulate,
  } as any)) as any[];

  return workouts[0] || null;
};

const workoutBelongsToClub = (workout, clubId) => {
  const groupClubId = workout?.group_of_athletes?.club?.id;
  const userClubIds = Array.isArray(workout?.user)
    ? workout.user.map((athlete) => athlete?.club?.id)
    : [];

  return groupClubId === clubId || userClubIds.includes(clubId);
};

const isAthleteAssignedToWorkout = (workout, athleteId) => {
  const directAthleteIds = Array.isArray(workout?.user)
    ? workout.user.map((athlete) => athlete.id)
    : [];

  if (directAthleteIds.includes(athleteId)) {
    return true;
  }

  const groupUsers = Array.isArray(workout?.group_of_athletes?.users)
    ? workout.group_of_athletes.users
    : [];

  return groupUsers.some((athlete) => athlete.id === athleteId);
};

const getWorkoutAssignedAthletes = (workout) => {
  const athletes = new Map<number, any>();

  if (Array.isArray(workout?.user)) {
    workout.user.forEach((athlete) => {
      athletes.set(athlete.id, athlete);
    });
  }

  const groupUsers = Array.isArray(workout?.group_of_athletes?.users)
    ? workout.group_of_athletes.users
    : [];

  groupUsers.forEach((athlete) => {
    athletes.set(athlete.id, athlete);
  });

  return [...athletes.values()];
};

const isValidPerceivedEffort = (value) => {
  const effort = Number(value);
  return Number.isInteger(effort) && effort >= 1 && effort <= 10;
};

const buildSummaryFromSessions = (sessions) => {
  const totalSessions = sessions.length;

  if (!totalSessions) {
    return {
      totalSessions: 0,
      averageEffort: null,
      lastSession: null,
    };
  }

  const averageEffort =
    Math.round(
      (sessions.reduce((sum, session) => sum + session.perceivedEffort, 0) /
        totalSessions) *
        10,
    ) / 10;

  return {
    totalSessions,
    averageEffort,
    lastSession: formatSession(sessions[0]),
  };
};

const resolveSessionUserId = async (ctx, strapi, authUser, user, workout) => {
  const requestedUserId = toPositiveInteger(ctx.query?.userId);

  if (!requestedUserId || requestedUserId === authUser.id) {
    if (!isAthleteAssignedToWorkout(workout, authUser.id)) {
      return {
        error: ctx.forbidden("Workout is not assigned to this athlete"),
      };
    }

    return { userId: authUser.id };
  }

  if (!isCoach(user)) {
    return {
      error: ctx.forbidden("Only coaches can view other athletes sessions"),
    };
  }

  const clubId = user?.club?.id;

  if (!clubId || !workoutBelongsToClub(workout, clubId)) {
    return { error: ctx.notFound("Workout not found") };
  }

  const athlete = await strapi.db.query(USER_UID).findOne({
    where: {
      id: requestedUserId,
      club: {
        id: clubId,
      },
    },
  });

  if (!athlete) {
    return { error: ctx.notFound("Athlete not found") };
  }

  if (!isAthleteAssignedToWorkout(workout, requestedUserId)) {
    return { error: ctx.notFound("Athlete is not assigned to this workout") };
  }

  return { userId: requestedUserId };
};

const getSessionsForWorkoutUser = async (
  strapi,
  workoutId,
  userId,
  { page, pageSize, start },
) => {
  const filters = {
    workout: {
      id: {
        $eq: workoutId,
      },
    },
    user: {
      id: {
        $eq: userId,
      },
    },
  };

  const [sessions, total] = await Promise.all([
    strapi.entityService.findMany(WORKOUT_SESSION_UID, {
      filters,
      sort: { completedAt: "desc" },
      start,
      limit: pageSize,
      populate: sessionPopulate,
    } as any),
    strapi.db.query(WORKOUT_SESSION_UID).count({ where: filters }),
  ]);

  return {
    sessions: (sessions as any[]).map((session) => formatSession(session)),
    total,
  };
};

export default factories.createCoreController(
  WORKOUT_SESSION_UID,
  ({ strapi }) => ({
    async createForWorkout(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const workout = await getWorkoutByIdentifier(
        strapi,
        ctx.params.workoutId,
      );

      if (!workout) {
        return ctx.notFound("Workout not found");
      }

      if (!isAthleteAssignedToWorkout(workout, authUser.id)) {
        return ctx.forbidden("Workout is not assigned to this athlete");
      }

      const payload = getPayload(ctx);
      const perceivedEffort = Number(payload.perceivedEffort);
      const notes =
        typeof payload.notes === "string" ? payload.notes.trim() : "";
      const completedAtRaw = payload.completedAt;
      const completedAt = completedAtRaw
        ? new Date(completedAtRaw)
        : new Date();

      if (!isValidPerceivedEffort(perceivedEffort)) {
        return ctx.badRequest("perceivedEffort must be an integer from 1 to 10");
      }

      if (Number.isNaN(completedAt.getTime())) {
        return ctx.badRequest("completedAt must be a valid datetime");
      }

      const session = await strapi.entityService.create(WORKOUT_SESSION_UID, {
        data: {
          workout: {
            connect: [workout.id],
          },
          user: {
            connect: [authUser.id],
          },
          completedAt: completedAt.toISOString(),
          perceivedEffort,
          notes: notes || null,
        },
        populate: sessionPopulate,
      } as any);

      return ctx.send({
        data: formatSession(session),
      });
    },

    async listForWorkout(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const user = await getAuthenticatedUserWithClub(strapi, authUser.id);
      const workout = await getWorkoutByIdentifier(
        strapi,
        ctx.params.workoutId,
      );

      if (!workout) {
        return ctx.notFound("Workout not found");
      }

      const resolvedUser = await resolveSessionUserId(
        ctx,
        strapi,
        authUser,
        user,
        workout,
      );

      if (resolvedUser.error) {
        return resolvedUser.error;
      }

      const { page, pageSize, start } = getPagination(ctx);
      const { sessions, total } = await getSessionsForWorkoutUser(
        strapi,
        workout.id,
        resolvedUser.userId,
        { page, pageSize, start },
      );

      return ctx.send({
        data: sessions,
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.max(Math.ceil(total / pageSize), 1),
            total,
          },
        },
      });
    },

    async summaryForWorkout(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const user = await getAuthenticatedUserWithClub(strapi, authUser.id);
      const workout = await getWorkoutByIdentifier(
        strapi,
        ctx.params.workoutId,
      );

      if (!workout) {
        return ctx.notFound("Workout not found");
      }

      const resolvedUser = await resolveSessionUserId(
        ctx,
        strapi,
        authUser,
        user,
        workout,
      );

      if (resolvedUser.error) {
        return resolvedUser.error;
      }

      const sessions = (await strapi.entityService.findMany(
        WORKOUT_SESSION_UID,
        {
          filters: {
            workout: {
              id: {
                $eq: workout.id,
              },
            },
            user: {
              id: {
                $eq: resolvedUser.userId,
              },
            },
          },
          sort: { completedAt: "desc" },
          limit: 1000,
        } as any,
      )) as any[];

      return ctx.send({
        data: buildSummaryFromSessions(sessions),
      });
    },

    async athletesSummaryForWorkout(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

      if (!isCoach(user)) {
        return ctx.forbidden("Only coaches can view athletes summaries");
      }

      const clubId = user?.club?.id;

      if (!clubId) {
        return ctx.badRequest("Coach club is required");
      }

      const workout = await getWorkoutByIdentifier(
        strapi,
        ctx.params.workoutId,
      );

      if (!workout || !workoutBelongsToClub(workout, clubId)) {
        return ctx.notFound("Workout not found");
      }

      const assignedAthletes = getWorkoutAssignedAthletes(workout);
      const assignedAthleteIds = assignedAthletes.map((athlete) => athlete.id);

      if (!assignedAthleteIds.length) {
        return ctx.send({ data: [] });
      }

      const sessions = (await strapi.entityService.findMany(
        WORKOUT_SESSION_UID,
        {
          filters: {
            workout: {
              id: {
                $eq: workout.id,
              },
            },
            user: {
              id: {
                $in: assignedAthleteIds,
              },
            },
          },
          sort: { completedAt: "desc" },
          limit: 5000,
          populate: sessionPopulate,
        } as any,
      )) as any[];

      const sessionsByAthlete = new Map<number, any[]>();

      sessions.forEach((session) => {
        const athleteId = session?.user?.id;

        if (!athleteId) return;

        const currentSessions = sessionsByAthlete.get(athleteId) || [];
        currentSessions.push(session);
        sessionsByAthlete.set(athleteId, currentSessions);
      });

      const data = assignedAthletes.map((athlete) => {
        const athleteSessions = sessionsByAthlete.get(athlete.id) || [];

        return {
          athlete: formatAthlete(athlete),
          ...buildSummaryFromSessions(athleteSessions),
        };
      });

      return ctx.send({ data });
    },
  }),
);
