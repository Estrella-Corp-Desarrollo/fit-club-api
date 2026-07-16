export default {
  routes: [
    {
      method: "GET",
      path: "/app/strava/status",
      handler: "strava-connection.appStatus",
      config: { policies: [], middlewares: [] },
    },
  ],
};
