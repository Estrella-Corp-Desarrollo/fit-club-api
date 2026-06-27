/**
 * workout controller
 */

import { factories } from '@strapi/strapi'

const WORKOUT_UID = 'api::workout.workout';
const GROUP_UID = 'api::group-of-athlete.group-of-athlete';
const EXERCISE_UID = 'api::exercise.exercise';
const WORKOUT_TYPE_UID = 'api::workout-type.workout-type';
const USER_UID = 'plugin::users-permissions.user';
const COACH_ROLE = 'coach';

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
        fields: ['url'],
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

const isCoach = (user) => String(user?.role?.name || user?.role?.type || '').toLowerCase() === COACH_ROLE;

const toPositiveInteger = (value) => {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const toUniqueIds = (values = []) =>
  [...new Set((Array.isArray(values) ? values : [values]).map(toPositiveInteger).filter(Boolean))];

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
  id: workout?.id,
  documentId: workout?.documentId,
  name: workout?.name,
  date: workout?.date,
  note: workout?.note,
  exercises: Array.isArray(workout?.exercises) ? workout.exercises.map(formatExercise) : [],
  group_of_athletes: workout?.group_of_athletes ? formatGroup(workout.group_of_athletes) : null,
  user: Array.isArray(workout?.user) ? workout.user.map(formatAthlete) : [],
  workout_type: workout?.workout_type ? formatWorkoutType(workout.workout_type) : null,
});

const getWorkoutByIdentifier = async (strapi, identifier) => {
  const workoutIdentifier = String(identifier || '').trim();

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

export default factories.createCoreController(WORKOUT_UID, ({ strapi }) => ({
  async appCatalogs(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized('Authentication required');
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden('Only coaches can manage workouts');
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest('Coach club is required');
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
          name: 'asc',
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
          name: 'asc',
        },
      } as any),
      strapi.entityService.findMany(WORKOUT_TYPE_UID, {
        limit: 200,
        sort: {
          name: 'asc',
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
          name: 'asc',
        },
      } as any),
    ]);

    return ctx.send({
      data: {
        athletes: (athletes as any[])
          .filter((athlete) => String(athlete?.role?.name || '').toLowerCase() !== COACH_ROLE)
          .map(formatAthlete),
        exercises: (exercises as any[]).map(formatExercise),
        groups: (groups as any[]).map(formatGroup),
        workoutTypes: (workoutTypes as any[]).map(formatWorkoutType),
      },
    });
  },

  async appCreate(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized('Authentication required');
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden('Only coaches can create workouts');
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest('Coach club is required');
    }

    const payload = getPayload(ctx);
    const name = String(payload.name || '').trim();
    const date = String(payload.date || '').trim();
    const note = String(payload.note || '').trim();
    const destinationType = String(payload.destinationType || '').trim();
    const destinationId = toPositiveInteger(payload.destinationId);
    const workoutTypeId = toPositiveInteger(payload.workoutTypeId || payload.workout_type);

    if (!name) {
      return ctx.badRequest('Name is required');
    }

    if (!note) {
      return ctx.badRequest('Note is required');
    }

    if (!workoutTypeId) {
      return ctx.badRequest('Workout type is required');
    }

    if (!['athlete', 'group'].includes(destinationType) || !destinationId) {
      return ctx.badRequest('Select an athlete or group');
    }

    const workoutType = await strapi.db.query(WORKOUT_TYPE_UID).findOne({
      where: {
        id: workoutTypeId,
      },
    });

    if (!workoutType) {
      return ctx.notFound('Workout type not found');
    }

    const data: any = {
      name,
      note,
      workout_type: {
        connect: [workoutTypeId],
      },
    };

    if (date) {
      data.date = date;
    }

    if (destinationType === 'athlete') {
      const athlete = await strapi.db.query(USER_UID).findOne({
        where: {
          club: {
            id: clubId,
          },
          id: destinationId,
        },
      });

      if (!athlete) {
        return ctx.notFound('Athlete not found');
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
        return ctx.notFound('Group not found');
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

  async appAddExercises(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized('Authentication required');
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden('Only coaches can update workouts');
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest('Coach club is required');
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);

    if (!workout) {
      return ctx.notFound('Workout not found');
    }

    if (!workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound('Workout not found');
    }

    const payload = getPayload(ctx);
    const exerciseIds = toUniqueIds(payload.exerciseIds || payload.exercises);

    if (!exerciseIds.length) {
      return ctx.badRequest('Select at least one exercise');
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
      return ctx.badRequest('All exercises must belong to the coach club');
    }

    const currentExerciseIds = Array.isArray(workout.exercises)
      ? workout.exercises.map((exercise) => exercise.id)
      : [];
    const nextExerciseIds = [...new Set([...currentExerciseIds, ...exerciseIds])];

    const updatedWorkout = await strapi.entityService.update(WORKOUT_UID, workout.id, {
      data: {
        exercises: {
          set: nextExerciseIds,
        },
      },
      populate: workoutPopulate,
    } as any);

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },

  async appRemoveExercise(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized('Authentication required');
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden('Only coaches can update workouts');
    }

    const clubId = user?.club?.id;

    if (!clubId) {
      return ctx.badRequest('Coach club is required');
    }

    const workout = await getWorkoutByIdentifier(strapi, ctx.params.workoutId);
    const exerciseId = toPositiveInteger(ctx.params.exerciseId);

    if (!workout) {
      return ctx.notFound('Workout not found');
    }

    if (!workoutBelongsToClub(workout, clubId)) {
      return ctx.notFound('Workout not found');
    }

    if (!exerciseId) {
      return ctx.badRequest('Exercise is required');
    }

    const currentExercises = Array.isArray(workout.exercises) ? workout.exercises : [];
    const exercise = currentExercises.find((item) => item.id === exerciseId);

    if (!exercise) {
      return ctx.notFound('Exercise not found in workout');
    }

    if (exercise.club?.id !== clubId) {
      return ctx.notFound('Exercise not found');
    }

    const remainingExerciseIds = currentExercises
      .map((item) => item.id)
      .filter((currentExerciseId) => currentExerciseId !== exerciseId);

    const updatedWorkout = await strapi.entityService.update(WORKOUT_UID, workout.id, {
      data: {
        exercises: {
          set: remainingExerciseIds,
        },
      },
      populate: workoutPopulate,
    } as any);

    return ctx.send({
      data: formatWorkout(updatedWorkout),
    });
  },
}));
