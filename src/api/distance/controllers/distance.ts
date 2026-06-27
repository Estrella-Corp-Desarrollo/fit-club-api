/**
 * distance controller
 */

import { factories } from '@strapi/strapi'
import { requireCoach } from '../../../utils/permissions'

const DISTANCE_UID = 'api::distance.distance';

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const formatDistance = (distance) => ({
  id: distance.id,
  documentId: distance.documentId,
  name: distance.name,
});

const findDistanceByName = async (strapi, name) => {
  const distances = (await strapi.entityService.findMany(DISTANCE_UID, {
    filters: {
      name: {
        $eqi: name,
      },
    },
    limit: 1,
  } as any)) as any[];

  return distances[0] || null;
};

export default factories.createCoreController(DISTANCE_UID, ({ strapi }) => ({
  async appFind(ctx) {
    const distances = (await strapi.entityService.findMany(DISTANCE_UID, {
      limit: 100,
      sort: {
        name: 'asc',
      },
    } as any)) as any[];

    return ctx.send({
      data: distances.map(formatDistance),
    });
  },

  async appCreate(ctx) {
    const coach = await requireCoach(ctx, strapi);
    if (coach.error) return coach.error;

    const payload = getPayload(ctx);
    const name = String(payload.name || '').trim();

    if (!name) {
      return ctx.badRequest('Distance name is required');
    }

    const existingDistance = await findDistanceByName(strapi, name);
    if (existingDistance) {
      return ctx.send({
        data: formatDistance(existingDistance),
      });
    }

    const distance = await strapi.entityService.create(DISTANCE_UID, {
      data: {
        name,
        publishedAt: new Date(),
      },
    } as any);

    return ctx.send({
      data: formatDistance(distance),
    });
  },
}));
