export default {
  routes: [
    {
      method: 'GET',
      path: '/app/distances',
      handler: 'distance.appFind',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/app/distances',
      handler: 'distance.appCreate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
