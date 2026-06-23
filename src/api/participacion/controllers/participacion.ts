/**
 * participacion controller
 */

import { factories } from '@strapi/strapi'

const PARTICIPACION_UID = 'api::participacion.participacion';
const EDITION_UID = 'api::edition.edition';
const TIME_PATTERN = /^\d{1,3}:[0-5]\d:[0-5]\d$/;

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const populateParticipacion: any = {
  edition: {
    populate: {
      carreras: {
        populate: {
          city: true,
          distancias: true,
        },
      },
    },
  },
};

const populateEditionResults: any = {
  ...populateParticipacion,
  athlete: {
    populate: {
      avatar: {
        fields: ['url'],
      },
      club: true,
    },
  },
};

const getAuthenticatedUserWithClub = async (strapi, userId) =>
  strapi.db.query('plugin::users-permissions.user').findOne({
    where: {
      id: userId,
    },
    populate: {
      club: true,
    },
  });

const formatCarrera = (carrera) => ({
  id: carrera.id,
  documentId: carrera.documentId,
  name: carrera.name,
  city: carrera.city
    ? {
        id: carrera.city.id,
        name: carrera.city.name,
      }
    : null,
  distancias: Array.isArray(carrera.distancias)
    ? carrera.distancias.map((distance) => ({
        id: distance.id,
        documentId: distance.documentId,
        name: distance.name,
      }))
    : [],
});

const formatAthlete = (athlete) =>
  athlete
    ? {
        id: athlete.id,
        name: athlete.name,
        lastname: athlete.lastname,
        username: athlete.username,
        avatar: athlete.avatar
          ? {
              id: athlete.avatar.id,
              url: athlete.avatar.url,
            }
          : null,
      }
    : null;

const formatParticipacion = (participacion) => ({
  id: participacion.id,
  documentId: participacion.documentId,
  time: participacion.time,
  position: participacion.position || null,
  athlete: formatAthlete(participacion.athlete),
  edition: participacion.edition
    ? {
        id: participacion.edition.id,
        documentId: participacion.edition.documentId,
        fecha: participacion.edition.fecha,
        carreras: Array.isArray(participacion.edition.carreras)
          ? participacion.edition.carreras.map(formatCarrera)
          : [],
      }
    : null,
});

const validatePayload = async (ctx, strapi) => {
  const payload = getPayload(ctx);
  const editionId = Number(payload.editionId || payload.edition);
  const time = typeof payload.time === 'string' ? payload.time.trim() : '';
  const position =
    payload.position === undefined || payload.position === null || payload.position === ''
      ? null
      : Number(payload.position);

  if (!Number.isInteger(editionId) || editionId <= 0) {
    return { error: ctx.badRequest('Edition is required') };
  }

  if (!TIME_PATTERN.test(time)) {
    return { error: ctx.badRequest('Time must use HH:MM:SS format') };
  }

  if (position !== null && (!Number.isInteger(position) || position <= 0)) {
    return { error: ctx.badRequest('Position must be a positive integer') };
  }

  const edition = await strapi.db.query(EDITION_UID).findOne({
    where: {
      id: editionId,
    },
  });

  if (!edition) {
    return { error: ctx.notFound('Edition not found') };
  }

  return {
    data: {
      edition,
      position,
      time,
    },
  };
};

export default factories.createCoreController(PARTICIPACION_UID, ({ strapi }) => ({
  async me(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const participaciones = (await strapi.entityService.findMany(PARTICIPACION_UID, {
      filters: {
        athlete: {
          id: {
            $eq: user.id,
          },
        },
      },
      limit: -1,
      populate: populateParticipacion,
    } as any)) as any[];

    return ctx.send({
      data: participaciones
        .sort(
          (firstParticipacion, secondParticipacion) =>
            new Date(secondParticipacion.edition?.fecha || 0).getTime() -
            new Date(firstParticipacion.edition?.fecha || 0).getTime()
        )
        .map(formatParticipacion),
    });
  },

  async byEdition(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const editionId = Number(ctx.params.editionId);
    if (!Number.isInteger(editionId) || editionId <= 0) {
      return ctx.badRequest('Edition is required');
    }

    const [edition, authenticatedUser] = await Promise.all([
      strapi.db.query(EDITION_UID).findOne({
        where: {
          id: editionId,
        },
      }),
      getAuthenticatedUserWithClub(strapi, user.id),
    ]);

    if (!edition) {
      return ctx.notFound('Edition not found');
    }

    const clubId = authenticatedUser?.club?.id;
    if (!clubId) {
      return ctx.send({
        data: [],
      });
    }

    const participaciones = (await strapi.entityService.findMany(PARTICIPACION_UID, {
      filters: {
        edition: {
          id: {
            $eq: editionId,
          },
        },
        athlete: {
          club: {
            id: {
              $eq: clubId,
            },
          },
        },
      },
      limit: -1,
      populate: populateEditionResults,
    } as any)) as any[];

    return ctx.send({
      data: participaciones
        .sort((firstParticipacion, secondParticipacion) => {
          if (firstParticipacion.position && secondParticipacion.position) {
            return firstParticipacion.position - secondParticipacion.position;
          }

          return firstParticipacion.time.localeCompare(secondParticipacion.time);
        })
        .map(formatParticipacion),
    });
  },

  async createMe(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const validation = await validatePayload(ctx, strapi);
    if (validation.error) return validation.error;

    const { edition, position, time } = validation.data;
    const existingParticipacion = await strapi.db.query(PARTICIPACION_UID).findOne({
      where: {
        athlete: {
          id: user.id,
        },
        edition: {
          id: edition.id,
        },
      },
    });
    const data: any = {
      athlete: user.id,
      edition: edition.id,
      position,
      time,
      publishedAt: new Date(),
    };

    const participacion = existingParticipacion
      ? await strapi.entityService.update(PARTICIPACION_UID, existingParticipacion.id, {
          data,
          populate: populateParticipacion,
        })
      : await strapi.entityService.create(PARTICIPACION_UID, {
          data,
          populate: populateParticipacion,
        });

    return ctx.send({
      data: formatParticipacion(participacion),
    });
  },

  async updateMe(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return ctx.badRequest('Participation is required');
    }

    const existingParticipacion = await strapi.db.query(PARTICIPACION_UID).findOne({
      where: {
        id,
        athlete: {
          id: user.id,
        },
      },
    });

    if (!existingParticipacion) {
      return ctx.notFound('Participation not found');
    }

    const validation = await validatePayload(ctx, strapi);
    if (validation.error) return validation.error;

    const { edition, position, time } = validation.data;
    const participacion = await strapi.entityService.update(PARTICIPACION_UID, id, {
      data: {
        edition: edition.id,
        position,
        time,
        publishedAt: new Date(),
      } as any,
      populate: populateParticipacion,
    });

    return ctx.send({
      data: formatParticipacion(participacion),
    });
  },
}));
