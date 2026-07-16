/**
 * Local smoke test for running /app endpoints against a running Strapi.
 * Does not print emails/tokens.
 *
 * Usage: node scripts/smoke-running-api.js
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const BASE = process.env.STRAPI_URL || "http://127.0.0.1:1337";

const db = new Database(".tmp/data.db");

const coachRole = db
  .prepare(`SELECT id FROM up_roles WHERE type = 'coach' LIMIT 1`)
  .get();
const athleteRole = db
  .prepare(`SELECT id FROM up_roles WHERE type = 'athlete' LIMIT 1`)
  .get();

const clubUsers = db
  .prepare(
    `SELECT u.id AS user_id, l.id AS link_id, l.role_id
     FROM up_users u
     JOIN up_users_club_lnk c ON c.user_id = u.id
     JOIN up_users_role_lnk l ON l.user_id = u.id
     ORDER BY u.id`,
  )
  .all();

if (!coachRole || !athleteRole || clubUsers.length < 2) {
  console.error(
    "Smoke needs coach+athlete roles and >=2 users in a club. Found club users:",
    clubUsers.length,
  );
  process.exit(1);
}

const coachRow = clubUsers[0];
const athleteRow = clubUsers[1];
const previousCoachRoleId = coachRow.role_id;

db.prepare(`UPDATE up_users_role_lnk SET role_id = ? WHERE id = ?`).run(
  coachRole.id,
  coachRow.link_id,
);

const issue = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });

const coachToken = issue(coachRow.user_id);
const athleteToken = issue(athleteRow.user_id);
const targetId = athleteRow.user_id;

const restoreRole = () => {
  db.prepare(`UPDATE up_users_role_lnk SET role_id = ? WHERE id = ?`).run(
    previousCoachRoleId,
    coachRow.link_id,
  );
  db.close();
};

const request = async (method, path, token, body) => {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: response.status, json };
};

const assert = (label, ok, detail) => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
};

const main = async () => {
  let failed = 0;
  console.log(
    `Smoke against ${BASE} (tempCoachId=${coachRow.user_id}, athleteId=${targetId})`,
  );

  try {
    {
      const res = await fetch(`${BASE}/api/app/running-profiles/me`);
      failed += assert(
        "GET /app/running-profiles/me without auth → 401/403",
        res.status === 401 || res.status === 403,
        `status=${res.status}`,
      )
        ? 0
        : 1;
    }

    {
      const res = await request("GET", "/app/running-profiles/me", athleteToken);
      failed += assert(
        "GET /app/running-profiles/me",
        res.status === 200,
        `status=${res.status} err=${JSON.stringify(res.json?.error || res.json?.message || "")}`,
      )
        ? 0
        : 1;
    }

    {
      const res = await request(
        "PUT",
        `/app/running-profiles/${targetId}`,
        coachToken,
        {
          phase: "temporada",
          thresholdPace: "3:45",
          easyPace: "5:00-5:20",
          intervalPace: "3:25",
          seriesPace: "3:10",
          group: "principiante",
          trackDays: 2,
          trackMode: "normal",
          event: "Smoke Test 10k",
          eventDate: "2026-08-01",
          goal: "45:00",
        },
      );
      const ok =
        res.status === 200 &&
        res.json?.data?.thresholdPace === "3:45" &&
        res.json?.data?.easyPace === "5:00-5:20";
      failed += assert(
        "PUT /app/running-profiles/:userId (paces)",
        ok,
        `status=${res.status} err=${JSON.stringify(res.json?.error || res.json?.message || "")}`,
      )
        ? 0
        : 1;
    }

    let blockId = null;
    {
      const res = await request("POST", "/app/training-blocks", coachToken, {
        userId: targetId,
        startDate: "2026-07-20",
        endDate: "2026-07-26",
        phase: "temporada",
        notes: "smoke block",
      });
      blockId = res.json?.data?.id || null;
      failed += assert(
        "POST /app/training-blocks",
        res.status === 200 && !!blockId,
        `status=${res.status} id=${blockId} err=${JSON.stringify(res.json?.error || res.json?.message || "")}`,
      )
        ? 0
        : 1;
    }

    let plannedId = null;
    {
      const res = await request("POST", "/app/planned-runs", coachToken, {
        userId: targetId,
        scheduledDate: "2026-07-22",
        type: "pista",
        distanceKm: 8,
        title: "6x1000 smoke",
        targetPace: "3:25",
        trainingBlockId: blockId,
      });
      plannedId = res.json?.data?.id || null;
      failed += assert(
        "POST /app/planned-runs",
        res.status === 200 && !!plannedId,
        `status=${res.status} id=${plannedId} err=${JSON.stringify(res.json?.error || res.json?.message || "")}`,
      )
        ? 0
        : 1;
    }

    {
      const res = await request(
        "GET",
        `/app/planned-runs?userId=${targetId}&from=2026-07-20&to=2026-07-26`,
        coachToken,
      );
      const count = Array.isArray(res.json?.data) ? res.json.data.length : 0;
      failed += assert(
        "GET /app/planned-runs range",
        res.status === 200 && count >= 1,
        `status=${res.status} count=${count}`,
      )
        ? 0
        : 1;
    }

    let activityId = null;
    {
      const res = await request("POST", "/app/running-activities", athleteToken, {
        performedAt: "2026-07-16",
        type: "trote",
        completed: true,
        distanceKm: 7.5,
        notes: "smoke manual",
        plannedRunId: plannedId,
      });
      activityId = res.json?.data?.id || null;
      failed += assert(
        "POST /app/running-activities (manual)",
        res.status === 200 &&
          res.json?.data?.source === "manual" &&
          Number(res.json?.data?.distanceKm) === 7.5,
        `status=${res.status} err=${JSON.stringify(res.json?.error || res.json?.message || "")}`,
      )
        ? 0
        : 1;
    }

    {
      const body = {
        userId: targetId,
        externalId: "smoke|2026-07-15|trote|5",
        source: "sheets_import",
        performedAt: "2026-07-15",
        type: "trote",
        completed: true,
        distanceKm: 5,
        notes: "smoke import",
      };
      const first = await request(
        "POST",
        "/app/running-activities/import",
        coachToken,
        body,
      );
      const second = await request(
        "POST",
        "/app/running-activities/import",
        coachToken,
        body,
      );
      const sameId = first.json?.data?.id === second.json?.data?.id;
      const secondUpdated = second.json?.meta?.upserted === "updated";
      failed += assert(
        "POST /app/running-activities/import idempotent",
        first.status === 200 &&
          second.status === 200 &&
          sameId &&
          secondUpdated,
        `first=${first.status}/${first.json?.meta?.upserted} second=${second.status}/${second.json?.meta?.upserted} sameId=${sameId}`,
      )
        ? 0
        : 1;
    }

    {
      const res = await request("GET", "/app/strava/status", athleteToken);
      failed += assert(
        "GET /app/strava/status",
        res.status === 200 && res.json?.meta?.oauthReady === false,
        `status=${res.status}`,
      )
        ? 0
        : 1;
    }

    {
      const athleteRes = await request(
        "GET",
        "/app/running-ranking",
        athleteToken,
      );
      const coachRes = await request("GET", "/app/running-ranking", coachToken);
      const shapeOk =
        athleteRes.status === 200 &&
        Array.isArray(athleteRes.json?.data?.athletes) &&
        Array.isArray(athleteRes.json?.data?.weekly) &&
        athleteRes.json?.data?.currentWeek?.week;
      failed += assert(
        "GET /app/running-ranking (athlete)",
        shapeOk,
        `status=${athleteRes.status} athletes=${athleteRes.json?.data?.athletes?.length}`,
      )
        ? 0
        : 1;
      failed += assert(
        "GET /app/running-ranking (coach)",
        coachRes.status === 200 && Array.isArray(coachRes.json?.data?.athletes),
        `status=${coachRes.status}`,
      )
        ? 0
        : 1;
    }

    if (activityId) {
      await request(
        "DELETE",
        `/app/running-activities/${activityId}`,
        coachToken,
      );
    }
    if (plannedId) {
      await request("DELETE", `/app/planned-runs/${plannedId}`, coachToken);
    }
    if (blockId) {
      await request("DELETE", `/app/training-blocks/${blockId}`, coachToken);
    }

    console.log(
      failed === 0
        ? "\nAll smoke checks passed."
        : `\n${failed} check(s) failed.`,
    );
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    restoreRole();
  }
};

main().catch((error) => {
  console.error(error);
  try {
    restoreRole();
  } catch {
    // ignore
  }
  process.exit(1);
});
