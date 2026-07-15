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
  ],
};
