# API de carrera (fitclub-api)

Documentación espejo del contrato web. Fuente canónica para el front: `FitClubWeb/docs/running-api.md`.

- Content-types: `running-profile`, `planned-run`, `training-block`, `running-activity`, `strava-connection`
- Endpoints `/app/...` en los respectivos `*-app.ts`
- Ranking de club: `GET /app/running-ranking` (agregado planned + activities + profiles; semana domingo–sábado; km reales sin filtrar por `completed`)
- Create/update manual de actividades acepta métricas opcionales: `avgHr`, `maxHr`, `avgCadence`, `avgWatts`, `maxWatts`
- Import Sheets: [sheets-import-plan.md](./sheets-import-plan.md) + `scripts/import-sheets-running.mjs`
- Strava OAuth + webhook: [strava.md](./strava.md)

`workout` / `workout-session` no se usan para km de carrera.
