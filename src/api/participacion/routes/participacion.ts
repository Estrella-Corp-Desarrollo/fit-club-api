export default {
  routes: [
    {
      method: 'GET',
      path: '/participaciones/me',
      handler: 'participacion.me',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/participaciones/edition/:editionId',
      handler: 'participacion.byEdition',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/participaciones/me',
      handler: 'participacion.createMe',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/participaciones/me/:id',
      handler: 'participacion.updateMe',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
