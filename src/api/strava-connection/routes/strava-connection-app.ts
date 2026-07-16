export default {
  routes: [
    {
      method: "GET",
      path: "/app/strava/status",
      handler: "strava-connection.appStatus",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "GET",
      path: "/app/strava/connect",
      handler: "strava-connection.appConnect",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "GET",
      path: "/app/strava/callback",
      handler: "strava-connection.appCallback",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/app/strava/disconnect",
      handler: "strava-connection.appDisconnect",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "GET",
      path: "/app/strava/webhook",
      handler: "strava-connection.appWebhook",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/app/strava/webhook",
      handler: "strava-connection.appWebhook",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
