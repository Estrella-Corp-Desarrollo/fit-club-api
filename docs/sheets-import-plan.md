# Plan de import Google Sheets → Strapi (carrera)

## Fuente

CSVs publicados (mismos que usa FitClubWeb hoy):

| Hoja | Rol | `gid` (publicado) |
| --- | --- | --- |
| REGISTRO DE ATLETAS | Perfiles / ritmos | `301394144` |
| PLAN SEMANAL | Volumen semanal agregado | `977075061` |
| DATOS_BRUTOS | Km realizados | `1135039714` |

URLs base: las de `FitClubWeb/src/services/teamRanking.js` (`CSV_URLS`).

Si compartes el sheet editable o CSVs frescos, revalidar columnas (sobre todo `Velocidad` / easy / series).

---

## Columnas reales observadas (2026-07-16)

### Athletes

| Col | Header | → `running-profile` |
| --- | --- | --- |
| 1 | Nombre | match → User (`name`+`lastname` / mapeo asistido) |
| 2 | Email | **match preferido** → User.email |
| 3 | Grupo | `group` |
| 4 | Estado Entrenamiento | `phase` (`Temporada`→`temporada`, etc.) |
| 5 | Estado | (Activo/…) — no modelado; filtrar inactivos si hace falta |
| 6 | Umbral | `thresholdPace` (strip `km`) |
| 7 | Intervalo | `intervalPace` |
| 8 | Velocidad | candidato a `seriesPace` (hoy suele vacío) |
| 9 | Dias pista | `trackDays` |
| 10 | Modo Pista | `trackMode` |
| 11 | Evento | `event` |
| 12 | Fecha Evento | `eventDate` (`DD/MM/YYYY` → ISO) |
| 13 | Meta | `goal` |

`easyPace`: no está en el sheet; opcional derivar en import desde umbral (+75–95s) o dejar null para que el coach lo complete.

### DATOS_BRUTOS → `running-activity`

| Col | Header | Campo |
| --- | --- | --- |
| 0 | Marca temporal | (auditoría; parte de `externalId`) |
| 1 | IAtleta | match user |
| 2 | Fecha de la sesión | `performedAt` |
| 3–5 | Semana / Mes / Año | **no persistir**; derivables |
| 6 | Tipo de sesión | `type` (normalizar) |
| 7 | ¿Completaste…? | `completed` |
| 8 | KM realizados | `distanceKm` |
| 9 | Observaciones | `notes` |

**Normalización de tipo (sheet → enum):**

| Sheet | Enum |
| --- | --- |
| Distancia Larga / Tirada larga | `tirada_larga` |
| Pista / Track | `pista` |
| Trote / Easy / Distancia | `trote` |
| otros | `otro` |

**Idempotencia:**

```
source = sheets_import
externalId = `${submittedAt}|${normalizeName(athlete)}|${sessionDate}|${type}|${km}`
sourceKey = sheets_import:${externalId}
```

Endpoint: `POST /api/app/running-activities/import`

### PLAN_SEMANAL → planned-runs (derivados)

Una fila sheet = agregados semanales (`volume`, `longRun`, `track`, `easyRuns`), **no** días.

Estrategia v1 de import histórico:

1. Calcular domingo–sábado de `week`+`year`.
2. Crear hasta 3 `planned-run` sintéticos en el domingo (o repartir):
   - `tirada_larga` con `distanceKm = longRun`
   - `pista` con `distanceKm = track`
   - `trote` con `distanceKm = easyRuns`
3. `externalId = plan|${athlete}|${week}|${year}|${type}`
4. `source = sheets_import`, `status = planned` (histórico)

**Nota:** el modelo nuevo de captura es día a día vía coach; este import solo preserva volumen histórico para ranking. Week/year siguen siendo derivados en runtime.

Opcional: un `training-block` por atleta/semana con `startDate`/`endDate` del rango.

---

## Matching sheet → User Strapi

Orden de match:

1. Email exacto (columna Email del roster).
2. Nombre normalizado (`name` + `lastname` / username).
3. Si no hay match → reportar en `unmatched.json` para mapeo asistido (`scripts/athlete-map.json`).

Formato sugerido `athlete-map.json`:

```json
{
  "israel fonseca solis": { "userId": 1 },
  "i.fonseca@tudi.mx": { "userId": 1 }
}
```

---

## Orden de migracion (ejecucion)

1. **Deploy API** con los content-types nuevos y reinicio (bootstrap siembra permisos en `authenticated`, `athlete` y `coach`).
2. **Smoke local/staging:** `npm run smoke:running` (Strapi en `:1337`).
3. **Dry-run import:** `npm run import:sheets-running:dry` → revisar `scripts/import-report.json` (`unmatched`).
4. **Mapa asistido:** copiar `athlete-map.example.json` → `athlete-map.json` y completar `userId` para nombres/emails sin match.
5. **Import real** (JWT coach con club):
   ```bash
   set STRAPI_URL=https://tu-api
   set STRAPI_TOKEN=<jwt-coach>
   npm run import:sheets-running
   ```
   Orden del script: profiles → activities → planned sintéticos del plan semanal.
6. **Re-ejecutar import** para confirmar idempotencia (mismos `sourceKey`, meta `updated`).
7. **Cutover UI** (fase posterior): FitClubWeb deja Sheets y consume `/app/running-*`.
8. **Strava** (fase posterior): OAuth + sync desde `connectedAt`.

Validacion local ya hecha: tablas SQLite creadas, permisos en athlete/coach, smoke 9/9 PASS, import dry-run parsea CSVs publicados.

---

## Fuera de alcance del import

- No tocar `workout-session`.
- No crear weekly-plan denormalizado (preferir derivar).
- No backfill Strava.
- UI FitClubWeb puede seguir leyendo Sheets hasta cutover.
