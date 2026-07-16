/**
 * Import Google Sheets (published CSV) → Strapi running entities.
 *
 * Usage:
 *   node scripts/import-sheets-running.mjs --dry-run
 *   STRAPI_URL=http://localhost:1337 STRAPI_TOKEN=<jwt> node scripts/import-sheets-running.mjs
 *
 * Optional:
 *   --map=./scripts/athlete-map.json
 *   --skip-plan
 *   --skip-activities
 *   --skip-profiles
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSV_URLS = {
  athletes:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRIXoXGJznUcqhWUVn1G_Gvi89PG9RNITdTiJJcWydzmWjPfjDQY0o72dWdKuNU9EOlzQ4mh-Aqibza/pub?gid=301394144&single=true&output=csv",
  plan: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRIXoXGJznUcqhWUVn1G_Gvi89PG9RNITdTiJJcWydzmWjPfjDQY0o72dWdKuNU9EOlzQ4mh-Aqibza/pub?gid=977075061&single=true&output=csv",
  raw: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRIXoXGJznUcqhWUVn1G_Gvi89PG9RNITdTiJJcWydzmWjPfjDQY0o72dWdKuNU9EOlzQ4mh-Aqibza/pub?gid=1135039714&single=true&output=csv",
};

const STRAPI_URL = (process.env.STRAPI_URL || "http://localhost:1337").replace(
  /\/$/,
  "",
);
const STRAPI_TOKEN = process.env.STRAPI_TOKEN || "";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipPlan = args.has("--skip-plan");
const skipActivities = args.has("--skip-activities");
const skipProfiles = args.has("--skip-profiles");
const mapArg = process.argv.find((arg) => arg.startsWith("--map="));
const mapPath = mapArg
  ? path.resolve(mapArg.slice("--map=".length))
  : path.join(__dirname, "athlete-map.json");

const normalizeName = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else if (char === "," && !quoted) {
      row.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows
    .map((values) => values.map((value) => value.trim()))
    .filter((values) => values.some(Boolean));
};

const stripPace = (value = "") =>
  String(value)
    .replace(/km/gi, "")
    .replace(/\s+/g, "")
    .trim() || null;

const normalizePhase = (value = "") => {
  const raw = normalizeName(value);
  if (raw.includes("pretemporada") || raw.includes("pre-temporada")) {
    return "pretemporada";
  }
  if (raw.includes("taper")) return "tapering";
  return "temporada";
};

const normalizeRunType = (value = "") => {
  const raw = normalizeName(value);
  if (raw.includes("pista") || raw.includes("track")) return "pista";
  if (
    raw.includes("tirada") ||
    raw.includes("distancia larga") ||
    raw.includes("long")
  ) {
    return "tirada_larga";
  }
  if (raw.includes("trote") || raw.includes("easy") || raw.includes("distancia")) {
    return "trote";
  }
  return "otro";
};

const parseSheetDate = (value = "") => {
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
};

const parseNumber = (value) => {
  if (!value) return 0;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace("km", "")
    .replace(/k$/, "")
    .replace(",", ".");
  const number = Number.parseFloat(normalized);
  return Number.isNaN(number) ? 0 : number;
};

const sundayOfIsoWeek = (week, year) => {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + (week - 1) * 7 - 1);
  return sunday.toISOString().slice(0, 10);
};

const loadAthleteMap = () => {
  if (!fs.existsSync(mapPath)) return {};
  return JSON.parse(fs.readFileSync(mapPath, "utf8"));
};

const api = async (method, apiPath, body) => {
  if (dryRun) {
    return { dryRun: true, method, apiPath, body };
  }

  if (!STRAPI_TOKEN) {
    throw new Error("STRAPI_TOKEN is required unless --dry-run");
  }

  const response = await fetch(`${STRAPI_URL}/api${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRAPI_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `${method} ${apiPath} → ${response.status}: ${JSON.stringify(json)}`,
    );
  }
  return json;
};

const fetchCsv = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CSV fetch failed ${response.status}: ${url}`);
  }
  return parseCsv(await response.text());
};

const resolveUserId = (athleteMap, usersByEmail, usersByName, athlete, email) => {
  const emailKey = normalizeName(email || "");
  const nameKey = normalizeName(athlete || "");

  if (emailKey && athleteMap[emailKey]?.userId) return athleteMap[emailKey].userId;
  if (nameKey && athleteMap[nameKey]?.userId) return athleteMap[nameKey].userId;
  if (emailKey && usersByEmail[emailKey]) return usersByEmail[emailKey];
  if (nameKey && usersByName[nameKey]) return usersByName[nameKey];
  return null;
};

const loadStrapiUsers = async () => {
  // Prefer live API; in dry-run fall back to local sqlite for match preview.
  if (!dryRun) {
    const json = await api(
      "GET",
      "/users?pagination[pageSize]=200&populate=role",
    );
    const users = Array.isArray(json) ? json : json.data || [];
    const byEmail = {};
    const byName = {};

    for (const user of users) {
      if (user.email) byEmail[normalizeName(user.email)] = user.id;
      const full = normalizeName(`${user.name || ""} ${user.lastname || ""}`);
      if (full) byName[full] = user.id;
      if (user.username) byName[normalizeName(user.username)] = user.id;
    }

    return { byEmail, byName };
  }

  try {
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(
      path.join(__dirname, "..", ".tmp", "data.db"),
      { readonly: true },
    );
    const users = db
      .prepare("SELECT id, email, username, name, lastname FROM up_users")
      .all();
    db.close();

    const byEmail = {};
    const byName = {};
    for (const user of users) {
      if (user.email) byEmail[normalizeName(user.email)] = user.id;
      const full = normalizeName(`${user.name || ""} ${user.lastname || ""}`);
      if (full) byName[full] = user.id;
      if (user.username) byName[normalizeName(user.username)] = user.id;
    }
    return { byEmail, byName };
  } catch {
    return { byEmail: {}, byName: {} };
  }
};

const importProfiles = async (rows, athleteMap, users) => {
  const unmatched = [];
  let upserted = 0;

  const headerIndex = rows.findIndex((row) =>
    normalizeName(row[1] || "").includes("nombre"),
  );
  const dataRows = rows.slice(headerIndex >= 0 ? headerIndex + 1 : 1);

  for (const row of dataRows) {
    const name = row[1];
    const email = row[2];
    if (!name || normalizeName(name) === "nombre") continue;

    const userId = resolveUserId(
      athleteMap,
      users.byEmail,
      users.byName,
      name,
      email,
    );
    if (!userId) {
      unmatched.push({ sheetName: name, email, reason: "no_user_match" });
      continue;
    }

    const body = {
      phase: normalizePhase(row[4]),
      group: row[3] || null,
      thresholdPace: stripPace(row[6]),
      intervalPace: stripPace(row[7]),
      seriesPace: stripPace(row[8]),
      trackDays: row[9] ? Number.parseInt(row[9], 10) : null,
      trackMode: row[10] || null,
      event: row[11] || null,
      eventDate: parseSheetDate(row[12]),
      goal: row[13] || null,
    };

    console.log(`[profile] ${name} → user ${userId}${dryRun ? " (dry-run)" : ""}`);
    if (!dryRun) {
      await api("PUT", `/app/running-profiles/${userId}`, body);
    }
    upserted += 1;
  }

  return { upserted, unmatched };
};

const importActivities = async (rows, athleteMap, users) => {
  const unmatched = [];
  let upserted = 0;

  for (const row of rows.slice(1)) {
    const submittedAt = row[0];
    const athlete = row[1];
    const sessionDate = parseSheetDate(row[2]);
    const type = normalizeRunType(row[6]);
    const completedRaw = normalizeName(row[7] || "");
    const km = parseNumber(row[8]);
    const notes = row[9] || null;

    if (!athlete || !sessionDate) continue;

    const userId = resolveUserId(
      athleteMap,
      users.byEmail,
      users.byName,
      athlete,
      null,
    );
    if (!userId) {
      unmatched.push({ sheetName: athlete, reason: "no_user_match" });
      continue;
    }

    const externalId = [
      submittedAt,
      normalizeName(athlete),
      sessionDate,
      type,
      km,
    ].join("|");

    const body = {
      userId,
      externalId,
      source: "sheets_import",
      performedAt: sessionDate,
      type,
      completed: !(completedRaw.startsWith("no") || completedRaw === "n"),
      distanceKm: km || null,
      notes,
    };

    console.log(`[activity] ${athlete} ${sessionDate} ${km}km`);
    await api("POST", "/app/running-activities/import", body);
    upserted += 1;
  }

  return { upserted, unmatched };
};

const importPlan = async (rows, athleteMap, users) => {
  const unmatched = [];
  let upserted = 0;

  for (const row of rows) {
    const athlete = row[0];
    if (!athlete || normalizeName(athlete).includes("atleta")) continue;
    if (normalizeName(athlete).includes("una fila")) continue;

    const week = Number.parseInt(row[1], 10);
    const year = Number.parseInt(row[2], 10);
    if (!week || !year) continue;

    const userId = resolveUserId(
      athleteMap,
      users.byEmail,
      users.byName,
      athlete,
      null,
    );
    if (!userId) {
      unmatched.push({ sheetName: athlete, reason: "no_user_match" });
      continue;
    }

    const scheduledDate = sundayOfIsoWeek(week, year);
    const parts = [
      { type: "tirada_larga", km: parseNumber(row[4]) },
      { type: "pista", km: parseNumber(row[5]) },
      { type: "trote", km: parseNumber(row[6]) },
    ].filter((part) => part.km > 0);

    for (const part of parts) {
      const externalId = `plan|${normalizeName(athlete)}|${week}|${year}|${part.type}`;
      const body = {
        userId,
        externalId,
        scheduledDate,
        type: part.type,
        distanceKm: part.km,
        title: `Plan S${week} ${year}`,
        status: "planned",
      };

      console.log(`[plan] ${athlete} S${week}/${year} ${part.type} ${part.km}`);
      await api("POST", "/app/planned-runs/import", body);
      upserted += 1;
    }
  }

  return { upserted, unmatched };
};

const main = async () => {
  console.log(`Strapi: ${STRAPI_URL}  dryRun=${dryRun}`);
  const athleteMap = loadAthleteMap();
  const users = await loadStrapiUsers();

  const report = {
    profiles: null,
    activities: null,
    plan: null,
    unmatched: [],
  };

  if (!skipProfiles) {
    const athleteRows = await fetchCsv(CSV_URLS.athletes);
    report.profiles = await importProfiles(athleteRows, athleteMap, users);
    report.unmatched.push(...report.profiles.unmatched);
  }

  if (!skipActivities) {
    const rawRows = await fetchCsv(CSV_URLS.raw);
    report.activities = await importActivities(rawRows, athleteMap, users);
    report.unmatched.push(...report.activities.unmatched);
  }

  if (!skipPlan) {
    const planRows = await fetchCsv(CSV_URLS.plan);
    report.plan = await importPlan(planRows, athleteMap, users);
    report.unmatched.push(...report.plan.unmatched);
  }

  const uniqueUnmatched = [
    ...new Map(
      report.unmatched.map((item) => [
        `${normalizeName(item.sheetName)}|${normalizeName(item.email || "")}`,
        item,
      ]),
    ).values(),
  ];

  const outPath = path.join(__dirname, "import-report.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        profiles: report.profiles,
        activities: report.activities,
        plan: report.plan,
        unmatched: uniqueUnmatched,
      },
      null,
      2,
    ),
  );

  console.log(`\nDone. Report: ${outPath}`);
  console.log(`Unmatched athletes: ${uniqueUnmatched.length}`);
  if (uniqueUnmatched.length) {
    console.log(
      "Fill scripts/athlete-map.json with userId mappings and re-run.",
    );
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
