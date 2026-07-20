const USER_UID = "plugin::users-permissions.user";
const COACH_ROLE = "coach";

const toPositiveInteger = (value) => {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const isCoach = (user) =>
  String(user?.role?.name || user?.role?.type || "").toLowerCase() ===
  COACH_ROLE;

const formatClubSummary = (club) =>
  club
    ? {
        id: club.id,
        documentId: club.documentId,
        name: club.name,
        description: club.description || null,
      }
    : null;

/** Club IDs the user may operate (membership). Falls back to active `club`. */
export const getCoachClubIds = (user) => {
  const fromMembership = Array.isArray(user?.clubs)
    ? user.clubs.map((club) => club?.id).filter(Boolean)
    : [];

  if (fromMembership.length) {
    return [...new Set(fromMembership)];
  }

  const activeId = user?.club?.id;
  return activeId ? [activeId] : [];
};

export const getActiveClubId = (user) => user?.club?.id || null;

export const coachHasClubAccess = (user, clubId) => {
  const targetId = toPositiveInteger(clubId) || Number(clubId);
  if (!targetId) return false;
  return getCoachClubIds(user).includes(targetId);
};

export const formatUserClubs = (user) => {
  const membership = Array.isArray(user?.clubs)
    ? user.clubs.map(formatClubSummary).filter(Boolean)
    : [];

  const active = formatClubSummary(user?.club);
  if (active && !membership.some((club) => club.id === active.id)) {
    membership.unshift(active);
  }

  return {
    club: active,
    clubs: membership,
    activeClubId: active?.id || null,
  };
};

/** Ensure active `club` is also linked in `clubs` (idempotent). */
export const ensureActiveClubInMembership = async (strapi, userId) => {
  const user = await strapi.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: { club: true, clubs: true, role: true },
  });

  if (!user?.club?.id) return user;

  const alreadyLinked = Array.isArray(user.clubs)
    ? user.clubs.some((club) => club.id === user.club.id)
    : false;

  if (alreadyLinked) return user;

  await strapi.db.query(USER_UID).update({
    where: { id: userId },
    data: {
      clubs: {
        connect: [{ id: user.club.id }],
      },
    },
  });

  return strapi.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: { club: true, clubs: true, role: true },
  });
};

/** Bootstrap: copy `club` → `clubs` for users that still lack membership. */
export const migrateActiveClubIntoClubs = async (strapi) => {
  const users = await strapi.db.query(USER_UID).findMany({
    where: {
      club: { id: { $notNull: true } },
    },
    populate: { club: true, clubs: true },
    limit: 5000,
  });

  let updated = 0;

  for (const user of users) {
    const activeId = user?.club?.id;
    if (!activeId) continue;

    const linked = Array.isArray(user.clubs)
      ? user.clubs.some((club) => club.id === activeId)
      : false;

    if (linked) continue;

    await strapi.db.query(USER_UID).update({
      where: { id: user.id },
      data: {
        clubs: {
          connect: [{ id: activeId }],
        },
      },
    });
    updated += 1;
  }

  if (updated > 0) {
    strapi.log.info(`Synced active club into clubs membership for ${updated} user(s).`);
  }

  return updated;
};

export const setActiveClubForUser = async (strapi, userId, clubId) => {
  const targetClubId = toPositiveInteger(clubId);
  if (!targetClubId) {
    return { error: "badRequest", message: "clubId must be a positive integer" };
  }

  let user = await strapi.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: { club: true, clubs: true, role: true },
  });

  if (!user) {
    return { error: "unauthorized", message: "Authentication required" };
  }

  if (!isCoach(user)) {
    return { error: "forbidden", message: "Only coaches can switch active club" };
  }

  user = (await ensureActiveClubInMembership(strapi, userId)) || user;

  if (!coachHasClubAccess(user, targetClubId)) {
    return {
      error: "forbidden",
      message: "Club is not in your membership. Add it before switching.",
    };
  }

  const club = await strapi.db.query("api::club.club").findOne({
    where: { id: targetClubId },
  });

  if (!club) {
    return { error: "notFound", message: "Club not found" };
  }

  await strapi.db.query(USER_UID).update({
    where: { id: userId },
    data: {
      club: targetClubId,
    },
  });

  const refreshed = await strapi.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: {
      club: true,
      clubs: true,
      role: true,
      avatar: true,
    },
  });

  return { user: refreshed };
};

export const addClubMembershipForUser = async (
  strapi,
  userId,
  clubId,
  { setActive = false } = {},
) => {
  const targetClubId = toPositiveInteger(clubId);
  if (!targetClubId) {
    return { error: "badRequest", message: "clubId must be a positive integer" };
  }

  const user = await strapi.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: { club: true, clubs: true, role: true },
  });

  if (!user) {
    return { error: "unauthorized", message: "Authentication required" };
  }

  if (!isCoach(user)) {
    return { error: "forbidden", message: "Only coaches can manage club membership" };
  }

  const club = await strapi.db.query("api::club.club").findOne({
    where: { id: targetClubId },
  });

  if (!club) {
    return { error: "notFound", message: "Club not found" };
  }

  const alreadyLinked = Array.isArray(user.clubs)
    ? user.clubs.some((item) => item.id === targetClubId)
    : false;

  const data: any = {};
  if (!alreadyLinked) {
    data.clubs = { connect: [{ id: targetClubId }] };
  }
  if (setActive || !user.club?.id) {
    data.club = targetClubId;
  }

  if (Object.keys(data).length) {
    await strapi.db.query(USER_UID).update({
      where: { id: userId },
      data,
    });
  }

  const refreshed = await strapi.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: {
      club: true,
      clubs: true,
      role: true,
      avatar: true,
    },
  });

  return { user: refreshed };
};
