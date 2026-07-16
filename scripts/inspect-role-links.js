const Database = require("better-sqlite3");
const db = new Database(".tmp/data.db", { readonly: true });

const tables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%role%' ORDER BY name`,
  )
  .all();
console.log("role tables:", tables.map((t) => t.name));

for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(
    t.name,
    cols.map((c) => c.name).join(","),
  );
  const sample = db.prepare(`SELECT * FROM ${t.name} LIMIT 5`).all();
  console.log(
    " sample keys:",
    sample[0] ? Object.keys(sample[0]) : [],
    "count=",
    db.prepare(`SELECT COUNT(*) AS c FROM ${t.name}`).get().c,
  );
}

db.close();
