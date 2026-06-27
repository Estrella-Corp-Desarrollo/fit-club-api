/**
 * evento controller
 */

import { factories } from '@strapi/strapi'
import { requireCoach } from '../../../utils/permissions'

const EVENTO_UID = 'api::evento.evento';
const CITY_UID = 'api::city.city';
const DISTANCE_UID = 'api::distance.distance';
const EDITION_UID = 'api::edition.edition';

const eventoPopulate: any = {
  city: true,
  distancias: true,
  editions: true,
};

const formatCity = (city) =>
  city
    ? {
        id: city.id,
        documentId: city.documentId,
        name: city.name,
      }
    : null;

const formatDistance = (distance) => ({
  id: distance.id,
  documentId: distance.documentId,
  name: distance.name,
});

const formatEdition = (edition) => ({
  id: edition.id,
  documentId: edition.documentId,
  fecha: edition.fecha,
});

const formatEvento = (evento) => ({
  id: evento.id,
  documentId: evento.documentId,
  name: evento.name,
  city: formatCity(evento.city),
  distancias: Array.isArray(evento.distancias) ? evento.distancias.map(formatDistance) : [],
  editions: Array.isArray(evento.editions) ? evento.editions.map(formatEdition) : [],
});

const getPagination = (ctx) => {
  const page = Math.max(Number(ctx.query?.pagination?.page || ctx.query?.page || 1), 1);
  const pageSize = Math.min(
    Math.max(Number(ctx.query?.pagination?.pageSize || ctx.query?.pageSize || 10), 1),
    100
  );

  return {
    page,
    pageSize,
    start: (page - 1) * pageSize,
  };
};

const getEventoFilters = (query) => {
  const search = String(query || '').trim();

  if (!search) return {};

  return {
    name: {
      $containsi: search,
    },
  };
};

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const getEventoByIdentifier = async (strapi, identifier) => {
  const raceIdentifier = String(identifier || '').trim();

  if (!raceIdentifier) return null;

  const numericId = Number(raceIdentifier);
  const filters = Number.isInteger(numericId)
    ? {
        id: numericId,
      }
    : {
        documentId: raceIdentifier,
      };
  const eventos = (await strapi.entityService.findMany(EVENTO_UID, {
    filters,
    limit: 1,
    populate: eventoPopulate,
  } as any)) as any[];

  return eventos[0] || null;
};

const normalizeIdList = (value) => {
  const values = Array.isArray(value) ? value : [value];

  return values
    .map((item) => Number(item?.id || item))
    .filter((item) => Number.isInteger(item) && item > 0);
};

const validateRaceRelations = async (ctx, strapi, cityId, distanceIds) => {
  const parsedCityId = Number(cityId);

  if (!Number.isInteger(parsedCityId) || parsedCityId <= 0) {
    return {
      error: ctx.badRequest('City is required'),
    };
  }

  if (!distanceIds.length) {
    return {
      error: ctx.badRequest('At least one distance is required'),
    };
  }

  const [city, distances] = await Promise.all([
    strapi.db.query(CITY_UID).findOne({
      where: {
        id: parsedCityId,
      },
    }),
    strapi.entityService.findMany(DISTANCE_UID, {
      filters: {
        id: {
          $in: distanceIds,
        },
      },
      limit: distanceIds.length,
    } as any),
  ]);

  if (!city) {
    return {
      error: ctx.badRequest('City is not valid'),
    };
  }

  if ((distances as any[]).length !== distanceIds.length) {
    return {
      error: ctx.badRequest('One or more distances are not valid'),
    };
  }

  return {
    cityId: parsedCityId,
    distanceIds,
  };
};

const createEditionForRace = async (strapi, raceId, editionDate) => {
  if (!editionDate) return null;

  const date = String(editionDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      error: 'Edition date must use YYYY-MM-DD format',
    };
  }

  return strapi.entityService.create(EDITION_UID, {
    data: {
      carreras: [raceId],
      fecha: date,
      publishedAt: new Date(),
    },
    populate: {
      carreras: true,
    },
  } as any);
};

export default factories.createCoreController(EVENTO_UID, ({ strapi }) => ({
  async appFind(ctx) {
    const { page, pageSize, start } = getPagination(ctx);
    const filters = getEventoFilters(ctx.query?.query);
    const [eventos, total] = await Promise.all([
      strapi.entityService.findMany(EVENTO_UID, {
        filters,
        limit: pageSize,
        populate: eventoPopulate,
        sort: {
          name: 'asc',
        },
        start,
      } as any),
      strapi.db.query(EVENTO_UID).count({
        where: filters,
      }),
    ]);

    return ctx.send({
      data: (eventos as any[]).map(formatEvento),
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    });
  },

  async appFindOne(ctx) {
    const identifier = String(ctx.params.id || '').trim();

    if (!identifier) {
      return ctx.badRequest('Race is required');
    }

    const evento = await getEventoByIdentifier(strapi, identifier);

    if (!evento) {
      return ctx.notFound('Race not found');
    }

    return ctx.send({
      data: formatEvento(evento),
    });
  },

  async appCreate(ctx) {
    const coach = await requireCoach(ctx, strapi);
    if (coach.error) return coach.error;

    const payload = getPayload(ctx);
    const name = String(payload.name || '').trim();
    const distanceIds = normalizeIdList(payload.distanceIds || payload.distancias || payload.distances);

    if (!name) {
      return ctx.badRequest('Race name is required');
    }

    const relations = await validateRaceRelations(ctx, strapi, payload.cityId || payload.city, distanceIds);
    if (relations.error) return relations.error;

    const race = await strapi.entityService.create(EVENTO_UID, {
      data: {
        city: relations.cityId,
        distancias: relations.distanceIds,
        name,
        publishedAt: new Date(),
      },
      populate: eventoPopulate,
    } as any);

    const edition = await createEditionForRace(strapi, race.id, payload.editionDate || payload.fecha);
    if (edition?.error) return ctx.badRequest(edition.error);

    const refreshedRace = await getEventoByIdentifier(strapi, race.id);

    return ctx.send({
      data: formatEvento(refreshedRace),
    });
  },

  async appCreateEdition(ctx) {
    const coach = await requireCoach(ctx, strapi);
    if (coach.error) return coach.error;

    const race = await getEventoByIdentifier(strapi, ctx.params.id);
    if (!race) {
      return ctx.notFound('Race not found');
    }

    const payload = getPayload(ctx);
    const edition = await createEditionForRace(strapi, race.id, payload.fecha || payload.editionDate);
    if (edition?.error) return ctx.badRequest(edition.error);
    if (!edition) return ctx.badRequest('Edition date is required');

    return ctx.send({
      data: formatEdition(edition),
    });
  },
}));
