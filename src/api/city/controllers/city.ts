/**
 * city controller
 */

import { factories } from '@strapi/strapi'
import { requireCoach } from '../../../utils/permissions'

const CITY_UID = 'api::city.city';

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const formatCity = (city) => ({
  id: city.id,
  documentId: city.documentId,
  name: city.name,
});

const findCityByName = async (strapi, name) => {
  const cities = (await strapi.entityService.findMany(CITY_UID, {
    filters: {
      name: {
        $eqi: name,
      },
    },
    limit: 1,
  } as any)) as any[];

  return cities[0] || null;
};

export default factories.createCoreController(CITY_UID, ({ strapi }) => ({
  async appFind(ctx) {
    const cities = (await strapi.entityService.findMany(CITY_UID, {
      limit: 100,
      sort: {
        name: 'asc',
      },
    } as any)) as any[];

    return ctx.send({
      data: cities.map(formatCity),
    });
  },

  async appCreate(ctx) {
    const coach = await requireCoach(ctx, strapi);
    if (coach.error) return coach.error;

    const payload = getPayload(ctx);
    const name = String(payload.name || '').trim();

    if (!name) {
      return ctx.badRequest('City name is required');
    }

    const existingCity = await findCityByName(strapi, name);
    if (existingCity) {
      return ctx.send({
        data: formatCity(existingCity),
      });
    }

    const city = await strapi.entityService.create(CITY_UID, {
      data: {
        name,
        publishedAt: new Date(),
      },
    } as any);

    return ctx.send({
      data: formatCity(city),
    });
  },
}));
