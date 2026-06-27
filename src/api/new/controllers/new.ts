/**
 * new controller
 */

import { factories } from '@strapi/strapi'

const NEW_UID = 'api::new.new';
const COACH_ROLE = 'coach';

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const getAuthenticatedUserWithClub = async (strapi, userId) =>
  strapi.db.query('plugin::users-permissions.user').findOne({
    where: {
      id: userId,
    },
    populate: {
      club: true,
      role: true,
    },
  });

const isCoach = (user) => String(user?.role?.name || user?.role?.type || '').toLowerCase() === COACH_ROLE;

const formatNews = (news) => ({
  id: news?.id,
  documentId: news?.documentId,
  title: news?.title,
  url: news?.url,
  createdAt: news?.createdAt,
  image: news?.image
    ? {
        id: news.image.id,
        url: news.image.url,
      }
    : null,
  club: news?.club
    ? {
        id: news.club.id,
        name: news.club.name,
      }
    : null,
});

export default factories.createCoreController(NEW_UID, ({ strapi }) => ({
  async appCreate(ctx) {
    const authUser = ctx.state.user;

    if (!authUser) {
      return ctx.unauthorized('Authentication required');
    }

    const user = await getAuthenticatedUserWithClub(strapi, authUser.id);

    if (!isCoach(user)) {
      return ctx.forbidden('Only coaches can create news');
    }

    if (!user?.club?.id) {
      return ctx.badRequest('Coach club is required');
    }

    const payload = getPayload(ctx);
    const title = String(payload.title || '').trim();
    const url = String(payload.url || '').trim();
    const imageId = payload.image ? Number(payload.image) : null;

    if (!title) {
      return ctx.badRequest('Title is required');
    }

    if (!url) {
      return ctx.badRequest('URL is required');
    }

    if (imageId !== null && (!Number.isInteger(imageId) || imageId <= 0)) {
      return ctx.badRequest('Image must be a valid media id');
    }

    const news = await strapi.entityService.create(NEW_UID, {
      data: {
        club: user.club.id,
        image: imageId || undefined,
        title,
        url,
      },
      populate: {
        club: true,
        image: {
          fields: ['url'],
        },
      },
    } as any);

    return ctx.send({
      data: formatNews(news),
    });
  },
}));
