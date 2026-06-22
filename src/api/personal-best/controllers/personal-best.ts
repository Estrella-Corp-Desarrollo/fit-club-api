/**
 * personal-best controller
 */

import { factories } from '@strapi/strapi'

const PERSONAL_BEST_UID = 'api::personal-best.personal-best';
const DISTANCE_UID = 'api::distance.distance';
const TIME_PATTERN = /^\d{1,3}:[0-5]\d:[0-5]\d$/;

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

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

    const distanceId = Number(ctx.params.distanceId);

    if (!Number.isInteger(distanceId) || distanceId <= 0) {
      return ctx.badRequest('Distance is required');
    }

    const payload = getPayload(ctx);
    const time = typeof payload.time === 'string' ? payload.time.trim() : '';
    const achievedAt = typeof payload.achievedAt === 'string' ? payload.achievedAt : '';

    if (!TIME_PATTERN.test(time)) {
      return ctx.badRequest('Time must use HH:MM:SS format');
    }

    if (!achievedAt || Number.isNaN(new Date(achievedAt).getTime())) {
      return ctx.badRequest('A valid achievedAt date is required');
    }

    const distance = await strapi.db.query(DISTANCE_UID).findOne({
      where: {
        id: distanceId,
      },
    });

    if (!distance) {
      return ctx.notFound('Distance not found');
    }

    const existingPersonalBest = await strapi.db.query(PERSONAL_BEST_UID).findOne({
      where: {
        athlete: {
          id: user.id,
        },
        distance: {
          id: distanceId,
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

    const personalBest = existingPersonalBest
      ? await strapi.entityService.update(PERSONAL_BEST_UID, existingPersonalBest.id, {
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

    return ctx.send({
      data: formatPersonalBest(personalBest),
    });
  },
}));
