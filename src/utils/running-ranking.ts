/**
 * Club running ranking — shape compatible with FitClubWeb getTeamRanking()/buildRanking.
 * Week/year derived Sunday–Saturday, aligned with scripts/import-sheets-running.mjs.
 */

const EVENT_PROFILES = {
  "5k": {
    peak: { elite: 35, avanzado: 28, principiante: 20 },
    long: 8,
    build: 8,
    taper: 1,
  },
  "10k": {
    peak: { elite: 45, avanzado: 38, principiante: 30 },
    long: 14,
    build: 10,
    taper: 1.5,
  },
  medio: {
    peak: { elite: 55, avanzado: 45, principiante: 35 },
    long: 18,
    build: 12,
    taper: 2,
  },
  maraton: {
    peak: { elite: 70, avanzado: 55, principiante: 45 },
    long: 32,
    build: 16,
    taper: 3,
  },
  ultra: {
    peak: { elite: 80, avanzado: 65, principiante: 50 },
    long: 35,
    build: 16,
    taper: 3,
  },
} as const;

const PHASE_STATUS: Record<string, string> = {
  temporada: "Temporada",
  pretemporada: "Pretemporada",
  tapering: "Tapering",
};

const capPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

export const normalizeName = (value = "") =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const sameAthlete = (left: string, right: string) =>
  normalizeName(left) === normalizeName(right);

const makeKey = (athlete: string, week: number | string, year: number | string) =>
  `${normalizeName(athlete)}|${Number(week)}|${Number(year)}`;

const unique = <T>(values: T[]) => [...new Set(values)];

const roundOne = (value: number) => Math.round(value * 10) / 10;

const paceRangeFromThreshold = (pace = "") => {
  const match = String(pace)
    .replace("km", "")
    .trim()
    .match(/^(\d+):(\d+)$/);
  if (!match) return "";

  const seconds =
    Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
  const format = (value: number) =>
    `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;

  return `${format(seconds + 75)} - ${format(seconds + 95)} /km`;
};

/** Inverse of import sundayOfIsoWeek — Sunday–Saturday week. */
export const weekInfoFromDate = (dateInput: string | Date) => {
  const dateStr =
    typeof dateInput === "string"
      ? String(dateInput).slice(0, 10)
      : dateInput.toISOString().slice(0, 10);

  const d = new Date(`${dateStr}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;

  const day = d.getUTCDay();
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - day);

  const monday = new Date(sunday);
  monday.setUTCDate(sunday.getUTCDate() + 1);

  const tmp = new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate(),
    ),
  );
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const isoYear = tmp.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round((tmp.getTime() - yearStart.getTime()) / 604800000);

  return {
    week,
    year: isoYear,
    month: sunday.getUTCMonth() + 1,
  };
};

const parseExternalPlanWeek = (externalId?: string | null) => {
  if (!externalId) return null;
  const match = String(externalId).match(
    /^plan\|[^|]+\|(\d+)\|(\d{4})\|/,
  );
  if (!match) return null;
  return {
    week: Number.parseInt(match[1], 10),
    year: Number.parseInt(match[2], 10),
  };
};

const eventIsEmpty = (event = "") => {
  const normalized = normalizeName(event);
  return (
    !normalized ||
    ["sin evento", "-", "n/a", "na", "ninguno"].includes(normalized)
  );
};

const normalizeEvent = (event = "") => {
  const normalized = normalizeName(event);
  if (normalized.includes("ultra")) return "ultra";
  if (normalized.includes("maraton") && !normalized.includes("medio"))
    return "maraton";
  if (normalized.includes("medio") || normalized.includes("21")) return "medio";
  if (normalized.includes("10")) return "10k";
  if (normalized.includes("5")) return "5k";
  return "medio";
};

const normalizeGroup = (group = "") => {
  const normalized = normalizeName(group);
  if (normalized.includes("elite")) return "elite";
  if (normalized.includes("princip")) return "principiante";
  return "avanzado";
};

/** Accepts DD/MM/YYYY (Sheets) or YYYY-MM-DD (Strapi). */
const parseDate = (value = "") => {
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const [year, month, day] = trimmed
      .slice(0, 10)
      .split("-")
      .map((part) => Number.parseInt(part, 10));
    if (!day || !month || year < 2000) return null;
    return new Date(year, month - 1, day);
  }

  const parts = trimmed.split("/");
  if (parts.length !== 3) return null;

  const day = Number.parseInt(parts[0], 10);
  const month = Number.parseInt(parts[1], 10) - 1;
  const year = Number.parseInt(parts[2], 10);
  if (!day || month < 0 || year < 2000) return null;

  return new Date(year, month, day);
};

const getWeekStats = (
  athlete: string,
  week: number,
  year: number,
  planMap: Record<string, number>,
  realMap: Record<string, number>,
) => {
  const key = makeKey(athlete, week, year);
  const planned = planMap[key] || 0;
  if (planned <= 0) return null;

  const real = realMap[key] || 0;
  const percent = capPercent((real / planned) * 100);

  return {
    active: real > 0,
    onTrack: percent >= 85,
    percent,
  };
};

const calculateEventProbability = (
  athlete: string,
  weeks: Array<{ week: number; year: number; month: number }>,
  planMap: Record<string, number>,
  realMap: Record<string, number>,
  planRows: PlanRow[],
  athleteInfo: AthleteInfo,
  rawRows: RawRow[],
) => {
  const stats: Array<{ active: boolean; onTrack: boolean; percent: number }> =
    [];
  let totalReal = 0;
  let maxLongPlan = 0;
  let maxLongReal = 0;

  weeks.forEach((week) => {
    const weekStats = getWeekStats(
      athlete,
      week.week,
      week.year,
      planMap,
      realMap,
    );
    if (weekStats) stats.push(weekStats);

    totalReal += realMap[makeKey(athlete, week.week, week.year)] || 0;

    planRows.forEach((row) => {
      if (
        sameAthlete(row.athlete, athlete) &&
        Number(row.week) === week.week &&
        Number(row.year) === week.year
      ) {
        maxLongPlan = Math.max(maxLongPlan, row.longRun);
      }
    });
  });

  if (!stats.length) return null;

  rawRows.forEach((row) => {
    if (!sameAthlete(row.athlete, athlete)) return;

    const week = Number.parseInt(String(row.week), 10);
    const year = Number.parseInt(String(row.year), 10);
    const isTrackedWeek = weeks.some(
      (item) => item.week === week && item.year === year,
    );
    const type = normalizeName(row.type);

    if (
      isTrackedWeek &&
      (type.includes("distancia") ||
        type.includes("larga") ||
        type.includes("tirada") ||
        type === "tirada_larga")
    ) {
      maxLongReal = Math.max(maxLongReal, row.km);
    }
  });

  const count = stats.length;
  const average = stats.reduce((sum, item) => sum + item.percent, 0) / count;
  const activeWeeks = stats.filter((item) => item.active).length;
  const onTrackWeeks = stats.filter((item) => item.onTrack).length;
  const profile =
    EVENT_PROFILES[normalizeEvent(athleteInfo.event)] || EVENT_PROFILES.medio;
  const group = normalizeGroup(athleteInfo.group);
  const targetPeak = profile.peak[group] || profile.peak.avanzado;
  const averageWeekly = totalReal / count;
  const maxLong = Math.max(maxLongPlan, maxLongReal);
  let timingScore = 70;
  let daysLeft: number | null = null;
  const eventDate = parseDate(athleteInfo.eventDate);

  if (eventDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    daysLeft = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
    if (daysLeft < 0) return null;

    const weeksLeft = daysLeft / 7;
    if (weeksLeft < profile.build * 0.4) {
      timingScore = Math.max(20, (weeksLeft / profile.build) * 100);
    } else if (weeksLeft <= profile.taper + 1) {
      timingScore = 90;
    } else if (weeksLeft <= profile.build) {
      timingScore = 60 + (weeksLeft / profile.build) * 30;
    } else {
      timingScore = 85;
    }
  }

  let probability =
    0.35 * Math.min(average, 100) +
    0.25 * Math.min(100, (averageWeekly / targetPeak) * 100) +
    0.2 * Math.min(100, (maxLong / profile.long) * 100) +
    0.1 * ((activeWeeks / count) * 100) +
    0.1 * timingScore;

  if (count >= 6) {
    const recentWeeks = stats.slice(0, Math.min(4, count));
    const olderWeeks = stats.slice(4);
    if (olderWeeks.length) {
      const recentAverage =
        recentWeeks.reduce((sum, item) => sum + item.percent, 0) /
        recentWeeks.length;
      const olderAverage =
        olderWeeks.reduce((sum, item) => sum + item.percent, 0) /
        olderWeeks.length;
      probability += Math.max(
        -8,
        Math.min(8, (recentAverage - olderAverage) * 0.12),
      );
    }
  }

  return {
    average: capPercent(average),
    averageWeekly,
    daysLeft,
    maxLong,
    onTrackWeeks,
    probability: capPercent(Math.max(5, probability)),
    weeks: count,
  };
};

type PlanRow = {
  athlete: string;
  week: number;
  year: number;
  month: number;
  volume: number;
  longRun: number;
  track: number;
  easyRuns: number;
};

type RawRow = {
  athlete: string;
  week: number;
  year: number;
  type: string;
  km: number;
};

type AthleteInfo = {
  name: string;
  userId?: number;
  group?: string;
  status?: string;
  thresholdPace?: string;
  intervalPace?: string;
  easyPace?: string;
  trackDays?: number;
  trackMode?: string;
  event?: string;
  eventDate?: string;
  goal?: string;
};

const buildPlanBreakdown = (
  plan: { volume: number; longRun: number; track: number; easyRuns: number },
  athleteInfo: AthleteInfo = {} as AthleteInfo,
) => {
  const status = athleteInfo.status || "Temporada";
  const thresholdPace = athleteInfo.thresholdPace || "";
  const intervalPace = athleteInfo.intervalPace || "";
  const easyPace =
    athleteInfo.easyPace || paceRangeFromThreshold(thresholdPace);
  const isPreseason = normalizeName(status) === "pretemporada";
  const isTapering = normalizeName(status) === "tapering";
  const twoTrackDays = athleteInfo.trackDays === 2;
  const onlyThreshold = athleteInfo.trackMode === "umbral";
  let easyRuns = plan.easyRuns;
  let track = plan.track;
  let trackTitle = "Pista";
  let trackDetails: Array<{ label: string; pace: string; value: number }> = [];

  if (isPreseason) {
    track = 0;
    easyRuns = roundOne(plan.volume - plan.longRun);
    trackTitle = "Sin pista";
  } else if (isTapering) {
    const intervals = roundOne(plan.track * 0.2);
    track = intervals;
    trackTitle = "Pista (Tapering)";
    trackDetails = [
      { label: "Intervalos", pace: intervalPace, value: intervals },
      { label: "Descarga", pace: "", value: 0 },
    ];
  } else {
    const trackPercent = twoTrackDays ? 0.2 : 0.15;
    const effectiveTrack = roundOne(plan.volume * trackPercent);
    const intervals = onlyThreshold
      ? 0
      : roundOne(effectiveTrack * trackPercent);
    const thresholds = roundOne(effectiveTrack - intervals);

    track = effectiveTrack;
    easyRuns = roundOne(plan.volume - plan.longRun - effectiveTrack);

    if (onlyThreshold && twoTrackDays) {
      const thresholdDayOne = roundOne(effectiveTrack * 0.4);
      const thresholdDayTwo = roundOne(effectiveTrack * 0.6);
      trackTitle = "Pista (Semana Umbral) - 2 sesiones";
      trackDetails = [
        { label: "Dia 1 umbral", pace: thresholdPace, value: thresholdDayOne },
        { label: "Dia 2 umbral", pace: thresholdPace, value: thresholdDayTwo },
      ];
    } else if (onlyThreshold) {
      trackTitle = "Pista (Semana Umbral)";
      trackDetails = [
        { label: "Umbrales", pace: thresholdPace, value: effectiveTrack },
      ];
    } else if (twoTrackDays) {
      const thresholdDayOne = roundOne(thresholds * 0.3);
      const thresholdDayTwo = roundOne(thresholds * 0.7);
      const dayOneTotal = roundOne(intervals + thresholdDayOne);
      trackTitle = "Pista - 2 sesiones";
      trackDetails = [
        { label: "Dia 1 total", pace: "", value: dayOneTotal },
        { label: "Intervalos", pace: intervalPace, value: intervals },
        { label: "Dia 1 umbral", pace: thresholdPace, value: thresholdDayOne },
        { label: "Dia 2 umbral", pace: thresholdPace, value: thresholdDayTwo },
      ];
    } else {
      trackDetails = [
        { label: "Intervalos", pace: intervalPace, value: intervals },
        { label: "Umbrales", pace: thresholdPace, value: thresholds },
      ];
    }
  }

  return {
    easyPace,
    easyRuns: Math.max(0, easyRuns),
    intervalPace,
    longRun: plan.longRun,
    longRunPace: easyPace,
    status,
    thresholdPace,
    track: Math.max(0, track),
    trackDetails,
    trackTitle,
    volume: plan.volume,
  };
};

export const buildRanking = ({
  rawRows,
  planRows,
  athletes,
}: {
  rawRows: RawRow[];
  planRows: PlanRow[];
  athletes: Record<string, AthleteInfo>;
}) => {
  const validRawRows = rawRows.filter((row) => {
    const year = Number.parseInt(String(row.year), 10);
    return year >= 2024 && year <= 2027 && row.km > 0;
  });
  const planMap: Record<string, number> = {};
  const realMap: Record<string, number> = {};

  planRows.forEach((row) => {
    if (!row.athlete || !row.week || !row.year) return;
    const key = makeKey(row.athlete, row.week, row.year);
    planMap[key] = (planMap[key] || 0) + row.volume;
  });

  validRawRows.forEach((row) => {
    if (!row.athlete || !row.week || !row.year) return;
    const key = makeKey(row.athlete, row.week, row.year);
    realMap[key] = (realMap[key] || 0) + row.km;
  });

  const weeks = unique(
    planRows
      .filter((row) => row.week && row.year)
      .map(
        (row) =>
          `${Number(row.week)}_${Number(row.year)}_${Number(row.month) || 0}`,
      ),
  )
    .map((value) => {
      const [week, year, month] = value.split("_").map(Number);
      return { week, year, month };
    })
    .filter((item) => item.year >= 2024 && item.year <= 2027)
    .sort((left, right) =>
      left.year !== right.year
        ? right.year - left.year
        : right.week - left.week,
    );

  if (!weeks.length) {
    const todayInfo = weekInfoFromDate(new Date()) || {
      week: 1,
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
    };

    return {
      athletes: Object.values(athletes)
        .map((athlete) => ({
          currentPlan: null,
          history: [],
          name: athlete.name,
          userId: athlete.userId ?? null,
          ...athlete,
        }))
        .sort((left, right) =>
          left.name.localeCompare(right.name, "es"),
        ),
      currentWeek: todayInfo,
      event: [],
      months: [],
      monthly: [],
      updatedAt: new Date().toISOString(),
      weekly: [],
    };
  }

  const currentWeek = weeks[0];
  const weeklyAthletes: string[] = [];

  planRows
    .filter(
      (row) =>
        Number(row.week) === currentWeek.week &&
        Number(row.year) === currentWeek.year,
    )
    .forEach((row) => {
      if (!weeklyAthletes.some((athlete) => sameAthlete(athlete, row.athlete))) {
        weeklyAthletes.push(row.athlete);
      }
    });

  const weekly = weeklyAthletes
    .map((athlete) => {
      const key = makeKey(athlete, currentWeek.week, currentWeek.year);
      const planned = planMap[key] || 0;
      const real = realMap[key] || 0;

      return {
        athlete,
        percent: planned > 0 ? capPercent((real / planned) * 100) : 0,
        planned,
        real,
      };
    })
    .sort((left, right) => right.percent - left.percent);

  const months = unique(
    planRows
      .filter((row) => row.month && row.year)
      .map((row) => `${Number(row.month)}_${Number(row.year)}`),
  )
    .map((value) => {
      const [month, year] = value.split("_").map(Number);
      return { month, year };
    })
    .filter(
      (item) =>
        item.year >= 2024 &&
        item.year <= 2027 &&
        item.month >= 1 &&
        item.month <= 12,
    )
    .sort((left, right) =>
      left.year !== right.year
        ? right.year - left.year
        : right.month - left.month,
    )
    .slice(0, 2);

  const monthlyAthletes: string[] = [];

  planRows
    .filter((row) =>
      months.some(
        (month) =>
          Number(row.month) === month.month && Number(row.year) === month.year,
      ),
    )
    .forEach((row) => {
      if (!monthlyAthletes.some((athlete) => sameAthlete(athlete, row.athlete))) {
        monthlyAthletes.push(row.athlete);
      }
    });

  const getMonthStats = (athlete: string, month: number, year: number) => {
    const monthPlan = planRows.filter(
      (row) =>
        Number(row.month) === month &&
        Number(row.year) === year &&
        sameAthlete(row.athlete, athlete),
    );
    const planned = monthPlan.reduce((sum, row) => sum + row.volume, 0);
    const real = unique(monthPlan.map((row) => `${row.week}|${row.year}`)).reduce(
      (sum, weekKey) => {
        const [week, weekYear] = weekKey.split("|");
        return sum + (realMap[makeKey(athlete, week, weekYear)] || 0);
      },
      0,
    );

    return {
      percent: planned > 0 ? capPercent((real / planned) * 100) : null,
      planned,
      real,
    };
  };

  const monthly = monthlyAthletes
    .map((athlete) => {
      const first = months[1]
        ? getMonthStats(athlete, months[1].month, months[1].year)
        : null;
      const second = months[0]
        ? getMonthStats(athlete, months[0].month, months[0].year)
        : null;
      const values = [first?.percent, second?.percent].filter(
        (value) => value !== null && value !== undefined,
      ) as number[];
      const average = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;

      return { athlete, average, first, second };
    })
    .sort((left, right) => right.average - left.average);

  const eventWeeks = weeks.slice(0, 12);
  const event = Object.values(athletes)
    .filter((athlete) => !eventIsEmpty(athlete.event))
    .map((athlete) => ({
      athlete,
      stats: calculateEventProbability(
        athlete.name,
        eventWeeks,
        planMap,
        realMap,
        planRows,
        athlete,
        validRawRows,
      ),
    }))
    .filter((item) => item.stats)
    .sort(
      (left, right) =>
        (right.stats?.probability || 0) - (left.stats?.probability || 0),
    );

  const athleteNames = unique([
    ...Object.values(athletes).map((athlete) => athlete.name),
    ...planRows.map((row) => row.athlete),
  ])
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "es"));

  const getAthleteHistory = (athlete: string) =>
    weeks.slice(0, 9).map((week) => {
      const planned = planMap[makeKey(athlete, week.week, week.year)] || 0;
      const real = realMap[makeKey(athlete, week.week, week.year)] || 0;

      return {
        label: `S${week.week}`,
        month: week.month,
        percent: planned > 0 ? capPercent((real / planned) * 100) : 0,
        planned,
        real,
        week: week.week,
        year: week.year,
      };
    });

  const getCurrentPlan = (athlete: string, athleteInfo: AthleteInfo) => {
    const rows = planRows.filter(
      (row) =>
        sameAthlete(row.athlete, athlete) &&
        Number(row.week) === currentWeek.week &&
        Number(row.year) === currentWeek.year,
    );

    if (!rows.length) return null;

    const basePlan = {
      easyRuns: rows.reduce((sum, row) => sum + row.easyRuns, 0),
      longRun: rows.reduce((sum, row) => sum + row.longRun, 0),
      track: rows.reduce((sum, row) => sum + row.track, 0),
      volume: rows.reduce((sum, row) => sum + row.volume, 0),
    };

    return {
      ...buildPlanBreakdown(basePlan, athleteInfo),
      month: currentWeek.month,
      week: currentWeek.week,
      year: currentWeek.year,
    };
  };

  return {
    athletes: athleteNames.map((name) => {
      const athleteInfo = athletes[normalizeName(name)] || { name };

      return {
        currentPlan: getCurrentPlan(name, athleteInfo),
        history: getAthleteHistory(name),
        name,
        userId: athleteInfo.userId ?? null,
        ...athleteInfo,
      };
    }),
    currentWeek,
    event,
    months,
    monthly,
    updatedAt: new Date().toISOString(),
    weekly,
  };
};

export const formatDisplayName = (user: {
  name?: string;
  lastname?: string;
  username?: string;
  email?: string;
}) =>
  [user?.name, user?.lastname].filter(Boolean).join(" ").trim() ||
  user?.username ||
  user?.email ||
  "Atleta";

export const profileToAthleteInfo = (
  user: {
    id: number;
    name?: string;
    lastname?: string;
    username?: string;
    email?: string;
  },
  profile?: {
    phase?: string;
    group?: string;
    thresholdPace?: string;
    intervalPace?: string;
    easyPace?: string;
    trackDays?: number | null;
    trackMode?: string;
    event?: string;
    eventDate?: string;
    goal?: string;
  } | null,
): AthleteInfo => {
  const name = formatDisplayName(user);
  const phase = profile?.phase || "temporada";

  return {
    name,
    userId: user.id,
    group: profile?.group || "",
    status: PHASE_STATUS[phase] || phase || "Temporada",
    thresholdPace: profile?.thresholdPace || "",
    intervalPace: profile?.intervalPace || "",
    easyPace: profile?.easyPace || "",
    trackDays: profile?.trackDays ?? 1,
    trackMode: normalizeName(profile?.trackMode || ""),
    event: profile?.event || "",
    eventDate: profile?.eventDate || "",
    goal: profile?.goal || "",
  };
};

/**
 * Aggregate planned-runs into one plan row per athlete/week
 * (volume = sum distanceKm; long/track/easy by type).
 */
export const aggregatePlanRows = (
  plannedRuns: Array<{
    scheduledDate?: string;
    type?: string;
    distanceKm?: number | string;
    externalId?: string;
    user?: { id?: number };
    userId?: number;
  }>,
  nameByUserId: Map<number, string>,
): PlanRow[] => {
  const byWeek = new Map<
    string,
    {
      athlete: string;
      week: number;
      year: number;
      month: number;
      longRun: number;
      track: number;
      easyRuns: number;
      other: number;
    }
  >();

  for (const run of plannedRuns) {
    const userId = run.user?.id || run.userId;
    if (!userId) continue;
    const athlete = nameByUserId.get(userId);
    if (!athlete) continue;

    const fromExternal = parseExternalPlanWeek(run.externalId);
    const fromDate = run.scheduledDate
      ? weekInfoFromDate(run.scheduledDate)
      : null;
    const week = fromExternal?.week ?? fromDate?.week;
    const year = fromExternal?.year ?? fromDate?.year;
    if (!week || !year) continue;

    const month =
      fromDate?.month ||
      (run.scheduledDate
        ? Number.parseInt(String(run.scheduledDate).slice(5, 7), 10)
        : 0);

    const km = Number(run.distanceKm) || 0;
    if (km <= 0) continue;

    const key = `${userId}|${week}|${year}`;
    if (!byWeek.has(key)) {
      byWeek.set(key, {
        athlete,
        week,
        year,
        month,
        longRun: 0,
        track: 0,
        easyRuns: 0,
        other: 0,
      });
    }

    const bucket = byWeek.get(key)!;
    const type = String(run.type || "").toLowerCase();
    if (type === "tirada_larga") bucket.longRun += km;
    else if (type === "pista") bucket.track += km;
    else if (type === "trote") bucket.easyRuns += km;
    else bucket.other += km;
  }

  return [...byWeek.values()].map((row) => ({
    athlete: row.athlete,
    week: row.week,
    year: row.year,
    month: row.month,
    longRun: roundOne(row.longRun),
    track: roundOne(row.track),
    easyRuns: roundOne(row.easyRuns),
    volume: roundOne(row.longRun + row.track + row.easyRuns + row.other),
  }));
};

export const aggregateRawRows = (
  activities: Array<{
    performedAt?: string;
    type?: string;
    distanceKm?: number | string;
    user?: { id?: number };
    userId?: number;
  }>,
  nameByUserId: Map<number, string>,
): RawRow[] => {
  const rows: RawRow[] = [];

  for (const activity of activities) {
    const userId = activity.user?.id || activity.userId;
    if (!userId || !activity.performedAt) continue;
    const athlete = nameByUserId.get(userId);
    if (!athlete) continue;

    const info = weekInfoFromDate(activity.performedAt);
    if (!info) continue;

    const km = Number(activity.distanceKm) || 0;
    if (km <= 0) continue;

    rows.push({
      athlete,
      week: info.week,
      year: info.year,
      type: activity.type || "",
      km,
    });
  }

  return rows;
};
