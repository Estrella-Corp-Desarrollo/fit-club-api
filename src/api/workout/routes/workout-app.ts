export default {
  routes: [
    {
      method: 'GET',
      path: '/app/workouts/catalogs',
      handler: 'workout.appCatalogs',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/app/workouts/manage',
      handler: 'workout.appManage',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/app/workouts',
      handler: 'workout.appCreate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/app/workouts/:workoutId/athletes',
      handler: 'workout.appAssignAthletes',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/app/workouts/:workoutId/athletes/:athleteId',
      handler: 'workout.appRemoveAthlete',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/app/workouts/:workoutId/group',
      handler: 'workout.appAssignGroup',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/app/workouts/:workoutId/group',
      handler: 'workout.appRemoveGroup',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/app/workouts/:workoutId/exercises',
      handler: 'workout.appAddExercises',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/app/workouts/:workoutId/exercises/:exerciseId',
      handler: 'workout.appRemoveExercise',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
