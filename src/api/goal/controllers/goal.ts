/**
 * goal controller
 */

import { factories } from "@strapi/strapi";

const GOAL_UID = "api::goal.goal";
const USER_UID = "plugin::users-permissions.user";
const COACH_ROLE = "coach";

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
  id: athlete?.id,
  documentId: athlete?.documentId,
  name: athlete?.name,
  lastname: athlete?.lastname,
  email: athlete?.email,
  username: athlete?.username,
});

const formatGoal = (goal) => ({
  id: goal.id,
  documentId: goal.documentId,
  name: goal.name,
  description: goal.description,
  startAt: goal.startAt,
  endAt: goal.endAt,
  goal_status: goal.goal_status,
  validated: Boolean(goal.validated),
  validatedAt: goal.validatedAt || null,
  validatedBy: goal.validatedBy ? formatAthlete(goal.validatedBy) : null,
  user: goal.user ? formatAthlete(goal.user) : null,
});

const getGoalByIdentifier = async (strapi, identifier) => {
  const goalIdentifier = String(identifier || "").trim();

  if (!goalIdentifier) return null;

  const numericId = Number(goalIdentifier);
  const filters = Number.isInteger(numericId)
    ? {
        id: numericId,
      }
    : {
        documentId: goalIdentifier,
      };

  const goals = (await strapi.entityService.findMany(GOAL_UID, {
    filters,
    limit: 1,
    populate: {
      user: {
        populate: {
          club: true,
        },
      },
      validatedBy: true,
    },
  } as any)) as any[];

  return goals[0] || null;
};

const getAthleteFieldSearchClauses = (searchTerm) => [
  {
    name: {
      $containsi: searchTerm,
    },
  },
  {
    lastname: {
      $containsi: searchTerm,
    },
  },
  {
    username: {
      $containsi: searchTerm,
    },
  },
  {
    email: {
      $containsi: searchTerm,
    },
  },
];

const findClubAthleteIdsBySearch = async (strapi, clubId, searchTerm) => {
  const search = String(searchTerm || "").trim();

  if (!search) return null;

  const tokens = search.split(/\s+/).filter(Boolean);
  const fieldClauses = [
    ...getAthleteFieldSearchClauses(search),
    ...tokens.flatMap((token) => getAthleteFieldSearchClauses(token)),
  ];

  const athletes = await strapi.db.query(USER_UID).findMany({
    where: {
      club: {
        id: clubId,
      },
      $or: fieldClauses,
    },
    select: ["id", "name", "lastname", "username", "email"],
    limit: 200,
  });

  const matchedAthletes =
    tokens.length <= 1
      ? athletes
      : athletes.filter((athlete) => {
          const haystack = [athlete.name, athlete.lastname, athlete.username, athlete.email]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return tokens.every((token) => haystack.includes(token.toLowerCase()));
        });

  return matchedAthletes.map((athlete) => athlete.id);
};

export default factories.createCoreController(GOAL_UID, ({ strapi }) => ({
  async appManage(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can manage athlete goals");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const { page, pageSize, start } = getPagination(ctx);
    const status = String(ctx.query?.status || "").trim();
    const athleteIds = await findClubAthleteIdsBySearch(
      strapi,
      clubId,
      ctx.query?.athlete,
    );

    if (Array.isArray(athleteIds) && athleteIds.length === 0) {
      return ctx.send({
        data: [],
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: 0,
            total: 0,
          },
        },
      });
    }

    const filters: any = {
      user: athleteIds
        ? {
            id: {
              $in: athleteIds,
            },
          }
        : {
            club: {
              id: {
                $eq: clubId,
              },
            },
          },
    };

    if (status) {
      filters.goal_status = {
        $eq: status,
      };
    }

    const [goals, total] = await Promise.all([
      strapi.entityService.findMany(GOAL_UID, {
        filters,
        limit: pageSize,
        start,
        populate: {
          user: true,
          validatedBy: true,
        },
        sort: [
          {
            endAt: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
      } as any),
      strapi.db.query(GOAL_UID).count({
        where: filters,
      }),
    ]);

    return ctx.send({
      data: (goals as any[]).map(formatGoal),
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

  async appSetValidation(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can validate athlete goals");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const goal = await getGoalByIdentifier(strapi, ctx.params.goalId);

    if (!goal || goal.user?.club?.id !== clubId) {
      return ctx.notFound("Goal not found");
    }

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const validated = Boolean(payload.validated);

    const updatedGoal = await strapi.entityService.update(GOAL_UID, goal.id, {
      data: validated
        ? {
            validated: true,
            validatedAt: new Date().toISOString(),
            validatedBy: {
              connect: [authUser.id],
            },
          }
        : {
            validated: false,
            validatedAt: null,
            validatedBy: {
              set: [],
            },
          },
      populate: {
        user: true,
        validatedBy: true,
      },
    } as any);

    return ctx.send({
      data: formatGoal(updatedGoal),
    });
  },
}));
