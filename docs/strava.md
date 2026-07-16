# Strava → FitClub (OAuth + webhook)

Integración opcional: Garmin → Strava → FitClub. Sin backfill histórico en v1
(solo actividades con `start_date >= connectedAt`).

## 1. Crear app en Strava

1. Entra en [https://www.strava.com/settings/api](https://www.strava.com/settings/api).
2. Crea una aplicación (o usa una existente).
3. Anota **Client ID** y **Client Secret**.
4. **Authorization Callback Domain**: el host de la API, sin `https://` ni path  
   (ej. `fit-club-api-tsihm.ondigitalocean.app`).
5. El redirect exacto que usa FitClub es:

```text
https://<API_HOST>/api/app/strava/callback
```

Tras el OAuth, la API redirige al navegador a:

```text
{FITCLUB_WEB_URL}/running/profile?strava=connected
```

(o `?strava=error&message=...`).

## 2. Variables de entorno (fitclub-api)

Ver `.env.example`. Obligatorias para `oauthReady: true`:

| Variable | Uso |
| -------- | --- |
| `STRAVA_CLIENT_ID` | OAuth |
| `STRAVA_CLIENT_SECRET` | OAuth + webhook registration |
| `STRAVA_REDIRECT_URI` | Debe coincidir con el callback de arriba |
| `FITCLUB_WEB_URL` | Redirect final tras conectar |
| `STRAVA_VERIFY_TOKEN` | Challenge del webhook (tú eliges el string) |
| `STRAVA_WEBHOOK_CALLBACK_URL` | `https://<API_HOST>/api/app/strava/webhook` |

Nunca commits Client Secret ni tokens.

## 3. Endpoints

| Método | Path | Auth | Notas |
| ------ | ---- | ---- | ----- |
| `GET` | `/app/strava/status` | JWT | `data`: conexión activa o `null`; `meta.oauthReady`, `meta.connected` |
| `GET` | `/app/strava/connect` | JWT | Redirect a Strava; `?format=json` → `{ data: { authorizeUrl } }` |
| `GET` | `/app/strava/callback` | público | Intercambia `code`, guarda `strava-connection`, redirect a web |
| `POST` | `/app/strava/disconnect` | JWT | `active: false`, tokens revocados; km previos se conservan |
| `GET`/`POST` | `/app/strava/webhook` | público | Challenge hub + eventos `activity.*` |

Scopes por defecto: `activity:read_all,profile:read_all`.

## 4. Registrar webhook

Con la API desplegada en HTTPS y el challenge respondiendo 200:

```bash
node scripts/strava-register-webhook.mjs
node scripts/strava-register-webhook.mjs --list
```

Strava solo permite **una** suscripción por app.

## 5. Sync (v1)

1. Evento `activity.create` / `update` → fetch detalle → si es Run/VirtualRun/TrailRun y `start_date >= connectedAt` → upsert `running-activity`:
   - `source=strava`
   - `externalId=<activityId>`
   - `sourceKey=strava:<activityId>`
   - métricas HR/cadence/watts si existen; `rawPayload` (subset)
2. `activity.delete` → borra la activity con ese `sourceKey`.
3. Actividades anteriores a `connectedAt` se ignoran.
4. Ride/etc. se ignoran.
5. Errores de sync se loguean; el webhook responde **200** para no reintentar en bucle agresivo.

Refresh de `accessToken` automático cuando está cerca de expirar.

## 6. UI (FitClubWeb)

En **Mi perfil de carrera** (`/running/profile`): Conectar / Desconectar Strava.  
Las actividades aparecen en **Mis km** como el resto (etiqueta amigable “Strava”, no `source=strava` crudo).

Registro manual (`/workouts/log`) sigue disponible.
