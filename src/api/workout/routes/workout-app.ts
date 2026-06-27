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
