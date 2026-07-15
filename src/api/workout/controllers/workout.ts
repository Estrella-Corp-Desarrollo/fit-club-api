/**
 * workout controller
 */

import { factories } from "@strapi/strapi";

const WORKOUT_UID = "api::workout.workout";
const GROUP_UID = "api::group-of-athlete.group-of-athlete";
const EXERCISE_UID = "api::exercise.exercise";
const WORKOUT_TYPE_UID = "api::workout-type.workout-type";
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
      users: true,
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

const toUniqueIds = (values = []) => [
  ...new Set(
    (Array.isArray(values) ? values : [values])
      .map(toPositiveInteger)
      .filter(Boolean),
  ),
];

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
  name: athlete.name,
  lastname: athlete.lastname,
  email: athlete.email,
  username: athlete.username,
});

const formatGroup = (group) => ({
  id: group.id,
  documentId: group.documentId,
  name: group.name,
  description: group.description,
});

const formatExercise = (exercise) => ({
  id: exercise.id,
  documentId: exercise.documentId,
  name: exercise.name,
  description: exercise.description,
  video: exercise.video,
});

const formatWorkoutType = (workoutType) => ({
  id: workoutType.id,
  documentId: workoutType.documentId,
  name: workoutType.name,
  description: workoutType.description,
});

const formatWorkout = (workout) => ({
  active: workout?.active !== false,
  id: workout?.id,
  documentId: workout?.documentId,
  name: workout?.name,
  date: workout?.date,
  note: workout?.note,
  exercises: Array.isArray(workout?.exercises)
    ? workout.exercises.map(formatExercise)
    : [],
  group_of_athletes: workout?.group_of_athletes
    ? formatGroup(workout.group_of_athletes)
    : null,
  user: Array.isArray(workout?.user) ? workout.user.map(formatAthlete) : [],
  workout_type: workout?.workout_type
    ? formatWorkoutType(workout.workout_type)
    : null,
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

const getClubWorkoutFilters = (clubId) => ({
  $or: [
    {
      group_of_athletes: {
        club: {
          id: {
            $eq: clubId,
          },
        },
      },
    },
    {
      user: {
        club: {
          id: {
            $eq: clubId,
          },
        },
      },
    },
  ],
});

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

const getAthleteIdWorkoutFilters = (athleteIds) => ({
  $or: [
    {
      user: {
        id: {
          $in: athleteIds,
        },
      },
    },
    {
      group_of_athletes: {
        users: {
          id: {
            $in: athleteIds,
          },
        },
      },
    },
  ],
});

const getClubAthletes = async (strapi, clubId, athleteIds) =>
  strapi.db.query(USER_UID).findMany({
    where: {
      club: {
        id: clubId,
      },
      id: {
        $in: athleteIds,
      },
    },
    limit: athleteIds.length,
  });

export default factories.createCoreController(WORKOUT_UID, ({ strapi }) => ({
  async appMine(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const { page, pageSize, start } = getPagination(ctx);
    const filters = {
      $and: [
        {
          active: {
            $ne: false,
          },
        },
        {
          $or: [
            {
              group_of_athletes: {
                users: {
                  id: {
                    $eq: authUser.id,
                  },
                },
              },
            },
            {
              user: {
                id: {
                  $eq: authUser.id,
                },
              },
            },
          ],
        },
      ],
    };

    const [workouts, total] = await Promise.all([
      strapi.entityService.findMany(WORKOUT_UID, {
        filters,
        limit: pageSize,
        populate: workoutPopulate,
        sort: [
          {
            date: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        start,
      } as any),
      strapi.db.query(WORKOUT_UID).count({
        where: filters,
      }),
    ]);

    return ctx.send({
      data: (workouts as any[]).map(formatWorkout),
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    });
  },

  async appManage(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can manage workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const { page, pageSize, start } = getPagination(ctx);
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

    const filters = athleteIds
      ? {
          $and: [getClubWorkoutFilters(clubId), getAthleteIdWorkoutFilters(athleteIds)],
        }
      : getClubWorkoutFilters(clubId);
    const [workouts, total] = await Promise.all([
      strapi.entityService.findMany(WORKOUT_UID, {
        filters,
        limit: pageSize,
        populate: workoutPopulate,
        sort: [
          {
            date: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        start,
      } as any),
      strapi.db.query(WORKOUT_UID).count({
        where: filters,
      }),
    ]);

    return ctx.send({
      data: (workouts as any[]).map(formatWorkout),
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    });
  },

  async appCatalogs(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can manage workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const [athletes, groups, workoutTypes, exercises] = await Promise.all([
      strapi.db.query(USER_UID).findMany({
        where: {
          club: {
            id: clubId,
          },
        },
        populate: {
          role: true,
        },
        orderBy: {
          name: "asc",
        },
        limit: 200,
      }),
      strapi.entityService.findMany(GROUP_UID, {
        filters: {
          club: {
            id: {
              $eq: clubId,
            },
          },
        },
        limit: 200,
        sort: {
          name: "asc",
        },
      } as any),
      strapi.entityService.findMany(WORKOUT_TYPE_UID, {
        limit: 200,
        sort: {
          name: "asc",
        },
      } as any),
      strapi.entityService.findMany(EXERCISE_UID, {
        filters: {
          club: {
            id: {
              $eq: clubId,
            },
          },
        },
        limit: 500,
        sort: {
          name: "asc",
        },
      } as any),
    ]);

    return ctx.send({
      data: {
        athletes: (athletes as any[]).map(formatAthlete),
        exercises: (exercises as any[]).map(formatExercise),
        groups: (groups as any[]).map(formatGroup),
        workoutTypes: (workoutTypes as any[]).map(formatWorkoutType),
      },
    });
  },

  async appCreate(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can create workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const payload = getPayload(ctx);
    const name = String(payload.name || "").trim();
    const date = String(payload.date || "").trim();
    const note = String(payload.note || "").trim();
    const destinationType = String(payload.destinationType || "").trim();
    const destinationId = toPositiveInteger(payload.destinationId);
    const workoutTypeId = toPositiveInteger(
      payload.workoutTypeId || payload.workout_type,
    );

    if (!name) {
      return ctx.badRequest("Name is required");
    }

    if (!note) {
      return ctx.badRequest("Note is required");
    }

    if (!workoutTypeId) {
      return ctx.badRequest("Workout type is required");
    }

    if (!["athlete", "group"].includes(destinationType) || !destinationId) {
      return ctx.badRequest("Select an athlete or group");
    }

    const workoutType = await strapi.db.query(WORKOUT_TYPE_UID).findOne({
      where: {
        id: workoutTypeId,
      },
    });

    if (!workoutType) {
      return ctx.notFound("Workout type not found");
    }

    const data: any = {
      active: true,
      name,
      note,
      workout_type: {
        connect: [workoutTypeId],
      },
    };

    if (date) {
      data.date = date;
    }

    if (destinationType === "athlete") {
      const athlete = await strapi.db.query(USER_UID).findOne({
        where: {
          club: {
            id: clubId,
          },
          id: destinationId,
        },
      });

      if (!athlete) {
        return ctx.notFound("Athlete not found");
      }

      data.user = {
        connect: [destinationId],
      };
    } else {
      const group = await strapi.db.query(GROUP_UID).findOne({
        where: {
          club: {
            id: clubId,
          },
          id: destinationId,
        },
      });

      if (!group) {
        return ctx.notFound("Group not found");
      }

      data.group_of_athletes = {
        connect: [destinationId],
      };
    }

    const workout = await strapi.entityService.create(WORKOUT_UID, {
      data,
      populate: workoutPopulate,
    } as any);

    return ctx.send({
      data: formatWorkout(workout),
    });
  },

  async appSetActive(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can update workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);

    if (!workout || !workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound("Workout not found");
    }

    const payload = getPayload(ctx);

    if (typeof payload.active !== "boolean") {
      return ctx.badRequest("Active must be true or false");
    }

    const updatedWorkout = await strapi.entityService.update(
      WORKOUT_UID,
      workout.id,
      {
        data: {
          active: payload.active,
        },
        populate: workoutPopulate,
      } as any,
    );

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },

  async appUpdateDetails(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can update workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);

    if (!workout || !workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound("Workout not found");
    }

    const payload = getPayload(ctx);
    const note = String(payload.note || "").trim();

    if (!note) {
      return ctx.badRequest("Note is required");
    }

    const updatedWorkout = await strapi.entityService.update(
      WORKOUT_UID,
      workout.id,
      {
        data: {
          note,
        },
        populate: workoutPopulate,
      } as any,
    );

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },

  async appAssignAthletes(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can update workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);

    if (!workout || !workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound("Workout not found");
    }

    const payload = getPayload(ctx);
    const athleteIds = toUniqueIds(
      payload.athleteIds || payload.athletes || payload.user,
    );

    if (!athleteIds.length) {
      return ctx.badRequest("Select at least one athlete");
    }

    const athletes = (await getClubAthletes(
      strapi,
      clubId,
      athleteIds,
    )) as any[];

    if (athletes.length !== athleteIds.length) {
      return ctx.badRequest("All athletes must belong to the coach club");
    }

    const currentAthleteIds = Array.isArray(workout.user)
      ? workout.user.map((athlete) => athlete.id)
      : [];
    const nextAthleteIds = [...new Set([...currentAthleteIds, ...athleteIds])];

    const updatedWorkout = await strapi.entityService.update(
      WORKOUT_UID,
      workout.id,
      {
        data: {
          user: {
            set: nextAthleteIds,
          },
        },
        populate: workoutPopulate,
      } as any,
    );

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },

  async appRemoveAthlete(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can update workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);
    const athleteId = toPositiveInteger(ctx.params.athleteId);

    if (!workout || !workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound("Workout not found");
    }

    if (!athleteId) {
      return ctx.badRequest("Athlete is required");
    }

    const currentAthletes = Array.isArray(workout.user) ? workout.user : [];
    const athlete = currentAthletes.find((item) => item.id === athleteId);

    if (!athlete || athlete.club?.id !== clubId) {
      return ctx.notFound("Athlete not found in workout");
    }

    const remainingAthleteIds = currentAthletes
      .map((item) => item.id)
      .filter((currentAthleteId) => currentAthleteId !== athleteId);

    if (!remainingAthleteIds.length && !workout.group_of_athletes?.id) {
      return ctx.badRequest("Workout must keep at least one athlete or group");
    }

    const updatedWorkout = await strapi.entityService.update(
      WORKOUT_UID,
      workout.id,
      {
        data: {
          user: {
            set: remainingAthleteIds,
          },
        },
        populate: workoutPopulate,
      } as any,
    );

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },

  async appAssignGroup(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can update workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);

    if (!workout || !workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound("Workout not found");
    }

    const payload = getPayload(ctx);
    const groupId = toPositiveInteger(payload.groupId || payload.group);

    if (!groupId) {
      return ctx.badRequest("Group is required");
    }

    const group = await strapi.db.query(GROUP_UID).findOne({
      where: {
        club: {
          id: clubId,
        },
        id: groupId,
      },
    });

    if (!group) {
      return ctx.notFound("Group not found");
    }

    const updatedWorkout = await strapi.entityService.update(
      WORKOUT_UID,
      workout.id,
      {
        data: {
          group_of_athletes: {
            set: [groupId],
          },
        },
        populate: workoutPopulate,
      } as any,
    );

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },

  async appRemoveGroup(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can update workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);

    if (!workout || !workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound("Workout not found");
    }

    if (!workout.group_of_athletes?.id) {
      return ctx.notFound("Group not found in workout");
    }

    if (!Array.isArray(workout.user) || !workout.user.length) {
      return ctx.badRequest("Workout must keep at least one athlete or group");
    }

    const updatedWorkout = await strapi.entityService.update(
      WORKOUT_UID,
      workout.id,
      {
        data: {
          group_of_athletes: {
            set: [],
          },
        },
        populate: workoutPopulate,
      } as any,
    );

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },

  async appAddExercises(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can update workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);

    if (!workout) {
      return ctx.notFound("Workout not found");
    }

    if (!workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound("Workout not found");
    }

    const payload = getPayload(ctx);
    const exerciseIds = toUniqueIds(payload.exerciseIds || payload.exercises);

    if (!exerciseIds.length) {
      return ctx.badRequest("Select at least one exercise");
    }

    const exercises = (await strapi.entityService.findMany(EXERCISE_UID, {
      filters: {
        club: {
          id: {
            $eq: clubId,
          },
        },
        id: {
          $in: exerciseIds,
        },
      },
      limit: exerciseIds.length,
    } as any)) as any[];

    if (exercises.length !== exerciseIds.length) {
      return ctx.badRequest("All exercises must belong to the coach club");
    }

    const currentExerciseIds = Array.isArray(workout.exercises)
      ? workout.exercises.map((exercise) => exercise.id)
      : [];
    const nextExerciseIds = [
      ...new Set([...currentExerciseIds, ...exerciseIds]),
    ];

    const updatedWorkout = await strapi.entityService.update(
      WORKOUT_UID,
      workout.id,
      {
        data: {
          exercises: {
            set: nextExerciseIds,
          },
        },
        populate: workoutPopulate,
      } as any,
    );

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },

  async appRemoveExercise(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized("Authentication required");
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden("Only coaches can update workouts");
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest("Coach club is required");
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);
    const exerciseId = toPositiveInteger(ctx.params.exerciseId);

    if (!workout) {
      return ctx.notFound("Workout not found");
    }

    if (!workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound("Workout not found");
    }

    if (!exerciseId) {
      return ctx.badRequest("Exercise is required");
    }

    const currentExercises = Array.isArray(workout.exercises)
      ? workout.exercises
      : [];
    const exercise = currentExercises.find((item) => item.id === exerciseId);

    if (!exercise) {
      return ctx.notFound("Exercise not found in workout");
    }

    if (exercise.club?.id !== clubId) {
      return ctx.notFound("Exercise not found");
    }

    const remainingExerciseIds = currentExercises
      .map((item) => item.id)
      .filter((currentExerciseId) => currentExerciseId !== exerciseId);

    const updatedWorkout = await strapi.entityService.update(
      WORKOUT_UID,
      workout.id,
      {
        data: {
          exercises: {
            set: remainingExerciseIds,
          },
        },
        populate: workoutPopulate,
      } as any,
    );

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },
}));
