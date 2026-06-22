export default {
  routes: [
    {
      method: 'GET',
      path: '/editions/search',
      handler: 'edition.search',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
