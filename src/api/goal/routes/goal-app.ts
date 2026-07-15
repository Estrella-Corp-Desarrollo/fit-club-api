export default {
  routes: [
    {
      method: "GET",
      path: "/app/goals/manage",
      handler: "goal.appManage",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "PUT",
      path: "/app/goals/:goalId/validation",
      handler: "goal.appSetValidation",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
