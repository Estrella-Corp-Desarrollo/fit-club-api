const Database = require("better-sqlite3");

const db = new Database(".tmp/data.db", { readonly: true });

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND (
         name LIKE '%running%'
         OR name LIKE '%planned%'
         OR name LIKE '%training_block%'
         OR name LIKE '%strava%'
       )
     ORDER BY name`,
  )
  .all();

console.log("tables:", tables.map((t) => t.name));

const users = db
  .prepare("SELECT id, email, username FROM up_users LIMIT 15")
  .all();
console.log("users:", users);

const roles = db.prepare("SELECT id, name, type FROM up_roles").all();
console.log("roles:", roles);

const perms = db
  .prepare(
    `SELECT action FROM up_permissions
     WHERE action LIKE '%running%'
        OR action LIKE '%planned%'
        OR action LIKE '%training-block%'
        OR action LIKE '%strava%'
     ORDER BY action`,
  )
  .all();

console.log("running perms count:", perms.length);
for (const p of perms) console.log(" -", p.action);

db.close();
