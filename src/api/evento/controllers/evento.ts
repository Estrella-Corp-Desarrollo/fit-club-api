/**
 * evento controller
 */

import { factories } from '@strapi/strapi'

const EVENTO_UID = 'api::evento.evento';

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

    const numericId = Number(identifier);
    const filters = Number.isInteger(numericId)
      ? {
          id: numericId,
        }
      : {
          documentId: identifier,
        };
    const eventos = (await strapi.entityService.findMany(EVENTO_UID, {
      filters,
      limit: 1,
      populate: eventoPopulate,
    } as any)) as any[];
    const evento = eventos[0];

    if (!evento) {
      return ctx.notFound('Race not found');
    }

    return ctx.send({
      data: formatEvento(evento),
    });
  },
}));
