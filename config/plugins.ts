// ./config/plugins.ts
export default ({ env }) => ({
  // ...
  'users-permissions': {
    config: {
      register: {
        allowedFields: [
          'username', // Campo obligatorio por defecto
          'email', // Campo obligatorio por defecto
          'password', // Campo obligatorio por defecto
          'club', // Tu campo adicional
          'birthdate', // Tu campo adicional
          'avatar', // Tu campo adicional
          'weight', // Tu campo adicional
          'height', // Tu campo adicional
          'lastname', // Tu campo adicional
        ],
      },
    },
  },
  // ...
});
