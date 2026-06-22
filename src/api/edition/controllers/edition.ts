/**
 * edition controller
 */

import { factories } from '@strapi/strapi'

const EDITION_UID = 'api::edition.edition';

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

const formatEdition = (edition) => ({
  id: edition.id,
  documentId: edition.documentId,
  fecha: edition.fecha,
  carreras: Array.isArray(edition.carreras) ? edition.carreras.map(formatCarrera) : [],
});

const matchesSearch = (edition, query) => {
  if (!query) return true;

  const normalizedQuery = query.toLowerCase();
  const values = [
    edition.fecha,
    ...(Array.isArray(edition.carreras)
      ? edition.carreras.flatMap((carrera) => [
          carrera.name,
          carrera.city?.name,
          ...(Array.isArray(carrera.distancias)
            ? carrera.distancias.map((distance) => distance.name)
            : []),
        ])
      : []),
  ];

  return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery));
};

export default factories.createCoreController(EDITION_UID, ({ strapi }) => ({
  async search(ctx) {
    const query = String(ctx.query?.query || ctx.query?.q || '').trim();
    const pageSize = Math.min(Number(ctx.query?.pageSize) || 25, 100);
    const editions = (await strapi.entityService.findMany(EDITION_UID, {
      limit: 100,
      populate: {
        carreras: {
          populate: {
            city: true,
            distancias: true,
          },
        },
      },
    })) as any[];
    const items = editions
      .filter((edition) => matchesSearch(edition, query))
      .sort(
        (firstEdition, secondEdition) =>
          new Date(secondEdition.fecha || 0).getTime() - new Date(firstEdition.fecha || 0).getTime()
      )
      .slice(0, pageSize)
      .map(formatEdition);

    return ctx.send({
      data: items,
    });
  },
}));
