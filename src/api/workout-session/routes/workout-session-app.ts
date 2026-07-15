export default {
  routes: [
    {
      method: "POST",
      path: "/app/workouts/:workoutId/sessions",
      handler: "workout-session.createForWorkout",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/app/workouts/:workoutId/sessions/summary",
      handler: "workout-session.summaryForWorkout",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/app/workouts/:workoutId/sessions/athletes-summary",
      handler: "workout-session.athletesSummaryForWorkout",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/app/workouts/:workoutId/sessions",
      handler: "workout-session.listForWorkout",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
