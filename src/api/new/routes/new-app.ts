export default {
  routes: [
    {
      method: 'POST',
      path: '/app/news',
      handler: 'new.appCreate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
