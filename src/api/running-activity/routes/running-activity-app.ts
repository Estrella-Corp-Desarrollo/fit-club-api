export default {
  routes: [
    {
      method: "GET",
      path: "/app/running-activities",
      handler: "running-activity.appList",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "POST",
      path: "/app/running-activities",
      handler: "running-activity.appCreate",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "POST",
      path: "/app/running-activities/import",
      handler: "running-activity.appUpsertImport",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "PUT",
      path: "/app/running-activities/:id",
      handler: "running-activity.appUpdate",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "DELETE",
      path: "/app/running-activities/:id",
      handler: "running-activity.appDelete",
      config: { policies: [], middlewares: [] },
    },
  ],
};
