/**
 * personal-best controller
 */

import { factories } from '@strapi/strapi'

const PERSONAL_BEST_UID = 'api::personal-best.personal-best';
const DISTANCE_UID = 'api::distance.distance';
const TIME_PATTERN = /^\d{1,3}:[0-5]\d:[0-5]\d$/;

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const savePersonalBest = async (strapi, id, data) => {
  return id
    ? await strapi.entityService.update(PERSONAL_BEST_UID, id, {
        data,
        populate: {
          distance: true,
        },
      })
    : await strapi.entityService.create(PERSONAL_BEST_UID, {
        data,
        populate: {
          distance: true,
        },
      });
};

const validatePersonalBestPayload = async (ctx, strapi) => {
  const payload = getPayload(ctx);
  const distanceId = Number(payload.distanceId || ctx.params.distanceId);
  const time = typeof payload.time === 'string' ? payload.time.trim() : '';
  const achievedAt = typeof payload.achievedAt === 'string' ? payload.achievedAt : '';

  if (!Number.isInteger(distanceId) || distanceId <= 0) {
    return { error: ctx.badRequest('Distance is required') };
  }

  if (!TIME_PATTERN.test(time)) {
    return { error: ctx.badRequest('Time must use HH:MM:SS format') };
  }

  if (!achievedAt || Number.isNaN(new Date(achievedAt).getTime())) {
    return { error: ctx.badRequest('A valid achievedAt date is required') };
  }

  const distance = await strapi.db.query(DISTANCE_UID).findOne({
    where: {
      id: distanceId,
    },
  });

  if (!distance) {
    return { error: ctx.notFound('Distance not found') };
  }

  return {
    data: {
      achievedAt,
      distance,
      time,
    },
  };
};

const formatPersonalBest = (personalBest) => ({
  id: personalBest.id,
  documentId: personalBest.documentId,
  time: personalBest.time,
  achievedAt: personalBest.achievedAt,
  distance: personalBest.distance
    ? {
        id: personalBest.distance.id,
        documentId: personalBest.distance.documentId,
        name: personalBest.distance.name,
      }
    : null,
});

export default factories.createCoreController(PERSONAL_BEST_UID, ({ strapi }) => ({
  async me(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const personalBests = (await strapi.entityService.findMany(PERSONAL_BEST_UID, {
      filters: {
        athlete: {
          id: {
            $eq: user.id,
          },
        },
      },
      populate: {
        distance: true,
      },
    })) as any[];

    return ctx.send({
      data: personalBests
        .sort(
          (firstPersonalBest, secondPersonalBest) =>
            new Date(secondPersonalBest.achievedAt).getTime() -
            new Date(firstPersonalBest.achievedAt).getTime()
        )
        .map(formatPersonalBest),
    });
  },

  async upsertMe(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const validation = await validatePersonalBestPayload(ctx, strapi);
    if (validation.error) return validation.error;

    const { achievedAt, distance, time } = validation.data;
    const existingPersonalBest = await strapi.db.query(PERSONAL_BEST_UID).findOne({
      where: {
        athlete: {
          id: user.id,
        },
        distance: {
          id: distance.id,
        },
      },
      populate: {
        distance: true,
      },
    });

    const data: any = {
      athlete: user.id,
      distance: distance.id,
      time,
      achievedAt,
      publishedAt: new Date(),
    };

    const personalBest = await savePersonalBest(strapi, existingPersonalBest?.id, data);

    return ctx.send({
      data: formatPersonalBest(personalBest),
    });
  },

  async updateMe(ctx) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return ctx.badRequest('Personal best is required');
    }

    const existingPersonalBest = await strapi.db.query(PERSONAL_BEST_UID).findOne({
      where: {
        id,
        athlete: {
          id: user.id,
        },
      },
      populate: {
        distance: true,
      },
    });

    if (!existingPersonalBest) {
      return ctx.notFound('Personal best not found');
    }

    const validation = await validatePersonalBestPayload(ctx, strapi);
    if (validation.error) return validation.error;

    const { achievedAt, distance, time } = validation.data;
    const existingDistanceId = existingPersonalBest.distance?.id;

    if (existingDistanceId && Number(existingDistanceId) !== Number(distance.id)) {
      return ctx.badRequest('No puedes cambiar la distancia de una marca existente');
    }

    const personalBest = await savePersonalBest(strapi, id, {
      distance: distance.id,
      time,
      achievedAt,
      publishedAt: new Date(),
    });

    return ctx.send({
      data: formatPersonalBest(personalBest),
    });
  },
}));
