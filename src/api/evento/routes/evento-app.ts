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
      method: 'POST',
      path: '/app/eventos',
      handler: 'evento.appCreate',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/app/eventos/:id/editions',
      handler: 'evento.appCreateEdition',
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
