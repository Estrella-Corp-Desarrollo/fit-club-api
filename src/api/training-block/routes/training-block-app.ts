export default {
  routes: [
    {
      method: "GET",
      path: "/app/training-blocks",
      handler: "training-block.appList",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "POST",
      path: "/app/training-blocks",
      handler: "training-block.appCreate",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "PUT",
      path: "/app/training-blocks/:id",
      handler: "training-block.appUpdate",
      config: { policies: [], middlewares: [] },
    },
    {
      method: "DELETE",
      path: "/app/training-blocks/:id",
      handler: "training-block.appDelete",
      config: { policies: [], middlewares: [] },
    },
  ],
};
