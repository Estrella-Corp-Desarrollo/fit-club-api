export default {
  routes: [
    {
      method: "GET",
      path: "/app/planned-runs",
      handler: "planned-run.appList",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "POST",
      path: "/app/planned-runs",
      handler: "planned-run.appCreate",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "POST",
      path: "/app/planned-runs/bulk",
      handler: "planned-run.appBulkCreate",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "POST",
      path: "/app/planned-runs/import",
      handler: "planned-run.appUpsertImport",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "PUT",
      path: "/app/planned-runs/:id",
      handler: "planned-run.appUpdate",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "DELETE",
      path: "/app/planned-runs/:id",
      handler: "planned-run.appDelete",
      config: { policies: [], middlewares: [] },
    },
  ],
};
