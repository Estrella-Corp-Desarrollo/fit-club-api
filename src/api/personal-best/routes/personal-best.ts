export default {
  routes: [
    {
      method: 'GET',
      path: '/personal-bests/me',
      handler: 'personal-best.me',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/personal-bests/me/:distanceId',
      handler: 'personal-best.upsertMe',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
