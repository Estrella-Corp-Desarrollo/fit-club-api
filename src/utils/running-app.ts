const USER_UID = "plugin::users-permissions.user";
const COACH_ROLE = "coach";

const RUN_TYPES = ["trote", "pista", "tirada_larga", "otro"] as const;
const PHASES = ["temporada", "pretemporada", "tapering"] as const;
const PLANNED_STATUSES = ["planned", "done", "skipped"] as const;
const ACTIVITY_SOURCES = ["manual", "sheets_import", "strava"] as const;

const PACE_PATTERN = /^\d{1,2}:[0-5]\d(-\d{1,2}:[0-5]\d)?$/;

const getPayload = (ctx) => ctx.request.body?.data || ctx.request.body || {};

const getAuthenticatedUserWithClub = async (strapi, userId) =>
  strapi.db.query(USER_UID).findOne({
    where: { id: userId },
    populate: { club: true, role: true },
  });

const isCoach = (user) =>
  String(user?.role?.name || user?.role?.type || "").toLowerCase() ===
  COACH_ROLE;

const toPositiveInteger = (value) => {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const getPagination = (ctx) => {
  const page = Math.max(
    Number(ctx.query?.pagination?.page || ctx.query?.page || 1),
    1,
  );
  const pageSize = Math.min(
    Math.max(
      Number(ctx.query?.pagination?.pageSize || ctx.query?.pageSize || 25),
      1,
    ),
    100,
  );

  return {
    page,
    pageSize,
    start: (page - 1) * pageSize,
  };
};

const formatAthlete = (athlete) =>
  athlete
    ? {
        id: athlete.id,
        documentId: athlete.documentId,
        name: athlete.name,
        lastname: athlete.lastname,
        email: athlete.email,
        username: athlete.username,
      }
    : null;

const resolveUserIdentifier = (value) => {
  if (value == null || value === "") return null;

  if (typeof value === "object") {
    return (
      value.id ||
      value.documentId ||
      value.connect?.[0]?.id ||
      value.connect?.[0]?.documentId ||
      null
    );
  }

  return value;
};

const findUserByIdentifier = async (strapi, identifier) => {
  const raw = resolveUserIdentifier(identifier);
  if (raw == null || raw === "") return null;

  const numericId = Number(raw);
  const where = Number.isInteger(numericId) && numericId > 0
    ? { id: numericId }
    : { documentId: String(raw) };

  return strapi.db.query(USER_UID).findOne({
    where,
    populate: { club: true, role: true },
  });
};

const assertClubAthleteAccess = async (strapi, authUser, targetUserId) => {
  const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);

  if (!actor) {
    return { error: "unauthorized", message: "Authentication required" };
  }

  const targetId = toPositiveInteger(targetUserId) || targetUserId;

  if (actor.id === targetId || String(actor.documentId) === String(targetUserId)) {
    return { actor, target: actor, isSelf: true };
  }

  if (!isCoach(actor)) {
    return { error: "forbidden", message: "Only coaches can access other athletes" };
  }

  const clubId = actor?.club?.id;
  if (!clubId) {
    return { error: "badRequest", message: "Coach club is required" };
  }

  const target = await findUserByIdentifier(strapi, targetUserId);
  if (!target) {
    return { error: "notFound", message: "Athlete not found" };
  }

  if (target.club?.id !== clubId) {
    return { error: "forbidden", message: "Athlete is not in your club" };
  }

  return { actor, target, isSelf: false };
};

const respondAccessError = (ctx, access) => {
  if (access.error === "unauthorized") return ctx.unauthorized(access.message);
  if (access.error === "forbidden") return ctx.forbidden(access.message);
  if (access.error === "notFound") return ctx.notFound(access.message);
  return ctx.badRequest(access.message);
};

const normalizePace = (value) => {
  if (value == null || value === "") return null;
  const pace = String(value).trim();
  if (!PACE_PATTERN.test(pace)) return { error: true, value: pace };
  return { value: pace };
};

const normalizeOptionalPace = (value) => {
  if (value == null || value === "") return { value: null };
  return normalizePace(value);
};

const normalizeRunType = (value, fallback = "trote") => {
  if (value == null || value === "") return fallback;

  const raw = String(value).trim().toLowerCase();
  const aliases: Record<string, (typeof RUN_TYPES)[number]> = {
    trote: "trote",
    easy: "trote",
    "easy run": "trote",
    pista: "pista",
    track: "pista",
    "tirada larga": "tirada_larga",
    tirada_larga: "tirada_larga",
    long: "tirada_larga",
    "long run": "tirada_larga",
    otro: "otro",
    other: "otro",
  };

  return aliases[raw] || (RUN_TYPES.includes(raw as any) ? (raw as any) : null);
};

const normalizePhase = (value, fallback = "temporada") => {
  if (value == null || value === "") return fallback;

  const raw = String(value).trim().toLowerCase();
  const aliases: Record<string, (typeof PHASES)[number]> = {
    temporada: "temporada",
    season: "temporada",
    pretemporada: "pretemporada",
    "pre-temporada": "pretemporada",
    tapering: "tapering",
    taper: "tapering",
  };

  return aliases[raw] || (PHASES.includes(raw as any) ? (raw as any) : null);
};

const isValidDateOnly = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const isValidDateTime = (value) =>
  typeof value === "string" && !Number.isNaN(new Date(value).getTime());

const buildSourceKey = (source, externalId) => {
  if (!externalId) return null;
  return `${source}:${externalId}`;
};

const connectUser = (user) => ({
  connect: [{ id: user.id }],
});

export {
  USER_UID,
  COACH_ROLE,
  RUN_TYPES,
  PHASES,
  PLANNED_STATUSES,
  ACTIVITY_SOURCES,
  PACE_PATTERN,
  getPayload,
  getAuthenticatedUserWithClub,
  isCoach,
  toPositiveInteger,
  getPagination,
  formatAthlete,
  resolveUserIdentifier,
  findUserByIdentifier,
  assertClubAthleteAccess,
  respondAccessError,
  normalizePace,
  normalizeOptionalPace,
  normalizeRunType,
  normalizePhase,
  isValidDateOnly,
  isValidDateTime,
  buildSourceKey,
  connectUser,
};
