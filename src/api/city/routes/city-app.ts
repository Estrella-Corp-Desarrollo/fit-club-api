export default {
  routes: [
    {
      method: 'GET',
      path: '/app/cities',
      handler: 'city.appFind',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/app/cities',
      handler: 'city.appCreate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
