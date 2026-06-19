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
  upload: {
    config: {
      provider: 'aws-s3',
      providerOptions: {
        accessKeyId: env('DO_SPACES_ACCESS_KEY'),
        secretAccessKey: env('DO_SPACES_SECRET_KEY'),
        region: env('DO_SPACES_REGION'), // ej: 'nyc3', 'sgp1', 'ams3'
        endpoint: env('DO_SPACES_ENDPOINT'), // ej: 'https://nyc3.digitaloceanspaces.com'
        params: {
          Bucket: env('DO_SPACES_BUCKET'),
        },
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    },
  },
  // ...
});
