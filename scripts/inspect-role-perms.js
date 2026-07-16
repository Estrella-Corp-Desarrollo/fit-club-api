const Database = require("better-sqlite3");
const db = new Database(".tmp/data.db", { readonly: true });

const q = (role) =>
  db
    .prepare(
      `SELECT p.action
       FROM up_permissions p
       JOIN up_permissions_role_lnk l ON l.permission_id = p.id
       JOIN up_roles r ON r.id = l.role_id
       WHERE r.type = ?
         AND (
           p.action LIKE '%running%'
           OR p.action LIKE '%planned%'
           OR p.action LIKE '%workout-session%'
           OR p.action LIKE '%strava%'
           OR p.action LIKE '%training-block%'
           OR p.action LIKE '%personal-best%'
         )
       ORDER BY p.action`,
    )
    .all(role);

for (const role of ["authenticated", "athlete", "coach"]) {
  const rows = q(role);
  console.log(`\n${role}: ${rows.length}`);
  for (const row of rows) console.log(" ", row.action);
}

db.close();
