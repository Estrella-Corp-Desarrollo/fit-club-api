const COACH_ROLE = 'Coach';
const USER_UID = 'plugin::users-permissions.user';

export const getAuthenticatedUserWithRole = async (strapi, userId) =>
  strapi.db.query(USER_UID).findOne({
    where: {
      id: userId,
    },
    populate: {
      club: true,
      role: true,
    },
  });

export const isCoachUser = (user) => {
  const roleName = typeof user?.role === 'string' ? user.role : user?.role?.name || user?.role?.type;

  return String(roleName || '').toLowerCase() === COACH_ROLE.toLowerCase();
};

export const requireCoach = async (ctx, strapi) => {
  const user = ctx.state.user;

  if (!user) {
    return {
      error: ctx.unauthorized('Authentication required'),
    };
  }

  const authenticatedUser = await getAuthenticatedUserWithRole(strapi, user.id);

  if (!isCoachUser(authenticatedUser)) {
    return {
      error: ctx.forbidden('Coach role required'),
    };
  }

  return {
    user: authenticatedUser,
  };
};
