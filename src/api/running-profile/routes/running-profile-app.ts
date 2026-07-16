export default {
  routes: [
    {
      method: "GET",
      path: "/app/running-ranking",
      handler: "running-profile.appRanking",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "GET",
      path: "/app/running-profiles/me",
      handler: "running-profile.appGetMine",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "GET",
      path: "/app/running-profiles/:userId",
      handler: "running-profile.appGetByUser",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "PUT",
      path: "/app/running-profiles/me",
      handler: "running-profile.appUpsertByUser",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "PUT",
      path: "/app/running-profiles/:userId",
      handler: "running-profile.appUpsertByUser",
      config: { policies: [], middlewares: [] },
    },
  ],
};
