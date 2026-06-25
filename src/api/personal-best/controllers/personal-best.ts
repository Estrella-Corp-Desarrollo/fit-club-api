/**
 * personal-best controller
 */

import { factories } from '@strapi/strapi'

const PERSONAL_BEST_UID = 'api::personal-best.personal-best';
const DISTANCE_UID = 'api::distance.distance';
const TIME_PATTERN = /^\d{1,3}:[0-5]\d:[0-5]\d$/;

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const savePersonalBest = async (strapi, personalBest, data) => {
  const options: any = {
    data,
    populate: {
      distance: true,
    },
    status: 'published',
  };

  return personalBest
    ? await strapi.documents(PERSONAL_BEST_UID).update({
        ...options,
        documentId: personalBest.documentId,
      })
    : await strapi.documents(PERSONAL_BEST_UID).create(options);
};

const connectRelation = (entity) => ({
  connect: [
    {
      documentId: entity.documentId,
    },
  ],
});

const getRelationIdentifier = (value) => {
  if (!value) return null;

  if (typeof value !== 'object') {
    return value;
  }

  const connect = Array.isArray(value.connect) ? value.connect[0] : value.connect;

  return (
    value.id ||
    value.documentId ||
    connect?.id ||
    connect?.documentId ||
    null
  );
};

const getDistanceWhere = (ctx) => {
  const payload = getPayload(ctx);
  const distanceIdentifier = getRelationIdentifier(
    payload.distanceId || payload.distance || ctx.params.distanceId
  );
  const numericDistanceId = Number(distanceIdentifier);

  if (Number.isInteger(numericDistanceId) && numericDistanceId > 0) {
    return {
      id: numericDistanceId,
    };
  }

  if (typeof distanceIdentifier === 'string' && distanceIdentifier.trim()) {
    return {
      documentId: distanceIdentifier,
    };
  }

  return null;
};

const validatePersonalBestFields = (ctx): any => {
  const payload = getPayload(ctx);
  const time = typeof payload.time === 'string' ? payload.time.trim() : '';
  const achievedAt = typeof payload.achievedAt === 'string' ? payload.achievedAt : '';

  if (!TIME_PATTERN.test(time)) {
    return { error: ctx.badRequest('Time must use HH:MM:SS format') };
  }

  if (!achievedAt || Number.isNaN(new Date(achievedAt).getTime())) {
    return { error: ctx.badRequest('A valid achievedAt date is required') };
  }

  return {
    data: {
      achievedAt,
      time,
    },
  };
};

const validatePersonalBestPayload = async (ctx, strapi): Promise<any> => {
  const distanceWhere = getDistanceWhere(ctx);
  const validation = validatePersonalBestFields(ctx);

  if (validation.error) return validation;

  if (!distanceWhere) {
    return { error: ctx.badRequest('Distance is required') };
  }

  const distance = await strapi.db.query(DISTANCE_UID).findOne({
    where: distanceWhere,
  });

  if (!distance) {
    return { error: ctx.notFound('Distance not found') };
  }

  return {
    data: {
      achievedAt: validation.data.achievedAt,
      distance,
      time: validation.data.time,
    },
  };
};

const validateDistance = async (ctx, strapi): Promise<any> => {
  const distanceWhere = getDistanceWhere(ctx);

  if (!distanceWhere) {
    return { error: ctx.badRequest('Distance is required') };
  }

  const distance = await strapi.db.query(DISTANCE_UID).findOne({
    where: distanceWhere,
  });

  if (!distance) {
    return { error: ctx.notFound('Distance not found') };
  }

  return { data: { distance } };
};

const validateOptionalDistance = async (ctx, strapi): Promise<any> => {
  const payload = getPayload(ctx);

  if (!payload.distanceId && !payload.distance && !ctx.params.distanceId) {
    return { data: { distance: null } };
  }

  return validateDistance(ctx, strapi);
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
      distance: connectRelation(distance),
      time,
      achievedAt,
      publishedAt: new Date(),
    };

    const personalBest = await savePersonalBest(strapi, existingPersonalBest, data);

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

    const validation = validatePersonalBestFields(ctx);
    if (validation.error) return validation.error;

    const { achievedAt, time } = validation.data;
    const distanceValidation = await validateOptionalDistance(ctx, strapi);
    if (distanceValidation.error) return distanceValidation.error;

    const data: any = {
      time,
      achievedAt,
      publishedAt: new Date(),
    };

    if (distanceValidation.data.distance) {
      data.distance = connectRelation(distanceValidation.data.distance);
    }

    const personalBest = await savePersonalBest(strapi, existingPersonalBest, data);

    return ctx.send({
      data: formatPersonalBest(personalBest),
    });
  },
}));
