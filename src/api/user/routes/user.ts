module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/auth/local/register', 
      handler: 'user.register',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/users',
      handler: 'user.find',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PATCH',
      path: '/users/:id',
      handler: 'user.update',  // Asegúrate de que apunte al método correcto
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'DELETE',
      path: '/users/:id',
      handler: 'user.delete',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
