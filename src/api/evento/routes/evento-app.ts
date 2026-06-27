export default {
  routes: [
    {
      method: 'GET',
      path: '/app/eventos',
      handler: 'evento.appFind',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/app/eventos/:id',
      handler: 'evento.appFindOne',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
