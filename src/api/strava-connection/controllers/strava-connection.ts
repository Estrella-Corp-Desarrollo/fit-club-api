/**
 * strava-connection controller — OAuth + webhook + status
 */

import { factories } from "@strapi/strapi";
import {
  getAuthenticatedUserWithClub,
  formatAthlete,
  connectUser,
} from "../../../utils/running-app";
import { isStravaOauthReady, getStravaVerifyToken } from "../../../utils/strava-config";
import {
  buildAuthorizeUrl,
  buildSuccessRedirect,
  exchangeAuthorizationCode,
  expiresAtToIso,
  verifyState,
} from "../../../utils/strava-oauth";
import {
  CONNECTION_UID,
  deactivateConnection,
  findConnectionByUserId,
  handleWebhookEvent,
} from "../services/strava-sync";

const formatConnection = (connection) =>
  connection
    ? {
        id: connection.id,
        documentId: connection.documentId,
        stravaAthleteId: connection.stravaAthleteId,
        connectedAt: connection.connectedAt,
        lastSyncedAt: connection.lastSyncedAt || null,
        active: connection.active !== false,
        user: formatAthlete(connection.user),
      }
    : null;

export default factories.createCoreController(CONNECTION_UID, ({ strapi }) => ({
  async appStatus(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");

    const connection = await findConnectionByUserId(strapi as any, actor.id);
    const active =
      connection && connection.active !== false ? formatConnection(connection) : null;

    return ctx.send({
      data: active,
      meta: {
        oauthReady: isStravaOauthReady(),
        connected: Boolean(active),
      },
    });
  },

  async appConnect(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    if (!isStravaOauthReady()) {
      return ctx.badRequest(
        "Strava OAuth no está configurado. Faltan STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET.",
      );
    }

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");

    let authorizeUrl: string;
    try {
      authorizeUrl = buildAuthorizeUrl(actor.id);
    } catch (error: any) {
      return ctx.badRequest(error?.message || "No se pudo iniciar OAuth Strava");
    }

    const wantsJson =
      String(ctx.query?.format || "").toLowerCase() === "json" ||
      String(ctx.request?.header?.accept || "").includes("application/json");

    if (wantsJson) {
      return ctx.send({ data: { authorizeUrl } });
    }

    ctx.redirect(authorizeUrl);
  },

  async appCallback(ctx) {
    const errorParam = ctx.query?.error;
    if (errorParam) {
      return ctx.redirect(
        buildSuccessRedirect(
          "error",
          String(ctx.query?.error_description || errorParam),
        ),
      );
    }

    if (!isStravaOauthReady()) {
      return ctx.redirect(
        buildSuccessRedirect("error", "Strava OAuth no está configurado"),
      );
    }

    const code = String(ctx.query?.code || "").trim();
    const state = String(ctx.query?.state || "").trim();

    if (!code || !state) {
      return ctx.redirect(buildSuccessRedirect("error", "Falta code o state"));
    }

    const verified = verifyState(state);
    if ("error" in verified) {
      return ctx.redirect(buildSuccessRedirect("error", verified.error));
    }

    const actor = await getAuthenticatedUserWithClub(strapi, verified.userId);
    if (!actor) {
      return ctx.redirect(buildSuccessRedirect("error", "Usuario no encontrado"));
    }

    try {
      const tokens = await exchangeAuthorizationCode(code);
      const athleteId = tokens.athlete?.id;
      if (!athleteId) {
        return ctx.redirect(
          buildSuccessRedirect("error", "Strava no devolvió athlete id"),
        );
      }

      const nowIso = new Date().toISOString();
      const connectionData: any = {
        stravaAthleteId: String(athleteId),
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: expiresAtToIso(tokens.expires_at),
        scopes: tokens.scope || null,
        connectedAt: nowIso,
        active: true,
        user: connectUser(actor),
      };

      const existingForUser = await findConnectionByUserId(strapi as any, actor.id);
      const existingForAthlete = (await strapi.entityService.findMany(
        CONNECTION_UID,
        {
          filters: { stravaAthleteId: { $eq: String(athleteId) } },
          limit: 1,
          populate: { user: true },
        } as any,
      )) as any[];

      if (existingForUser) {
        await strapi.entityService.update(CONNECTION_UID, existingForUser.id, {
          data: connectionData,
        } as any);
      } else if (existingForAthlete[0]) {
        const prior = existingForAthlete[0];
        if (
          prior.active !== false &&
          prior.user?.id &&
          Number(prior.user.id) !== Number(actor.id)
        ) {
          return ctx.redirect(
            buildSuccessRedirect(
              "error",
              "Esta cuenta de Strava ya está vinculada a otro usuario",
            ),
          );
        }
        await strapi.entityService.update(CONNECTION_UID, prior.id, {
          data: connectionData,
        } as any);
      } else {
        await strapi.entityService.create(CONNECTION_UID, {
          data: connectionData,
        } as any);
      }

      return ctx.redirect(buildSuccessRedirect("connected"));
    } catch (error: any) {
      strapi.log.error("[strava] OAuth callback failed", error);
      return ctx.redirect(
        buildSuccessRedirect("error", error?.message || "Error al conectar Strava"),
      );
    }
  },

  async appDisconnect(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");

    const connection = await findConnectionByUserId(strapi as any, actor.id);
    if (!connection || connection.active === false) {
      return ctx.send({
        data: null,
        meta: { disconnected: false, note: "No hay conexión activa" },
      });
    }

    const updated = await deactivateConnection(strapi as any, connection, {
      revoke: true,
    });

    return ctx.send({
      data: formatConnection(updated),
      meta: { disconnected: true },
    });
  },

  /**
   * Strava webhook verification (GET) + events (POST).
   * Public — no JWT. Validate hub.verify_token on GET.
   */
  async appWebhook(ctx) {
    const method = String(ctx.request.method || "").toUpperCase();

    if (method === "GET") {
      const mode = String(ctx.query?.["hub.mode"] || ctx.query?.hub_mode || "");
      const token = String(
        ctx.query?.["hub.verify_token"] || ctx.query?.hub_verify_token || "",
      );
      const challenge = String(
        ctx.query?.["hub.challenge"] || ctx.query?.hub_challenge || "",
      );
      const expected = getStravaVerifyToken();

      if (mode === "subscribe" && expected && token === expected && challenge) {
        ctx.status = 200;
        ctx.set("Content-Type", "application/json");
        ctx.body = { "hub.challenge": challenge };
        return;
      }

      return ctx.forbidden("Webhook verification failed");
    }

    // POST: acknowledge immediately; process best-effort
    const event = ctx.request.body || {};
    ctx.status = 200;
    ctx.body = { ok: true };

    try {
      const result = await handleWebhookEvent(strapi as any, event);
      strapi.log.info(`[strava] webhook handled: ${JSON.stringify(result)}`);
    } catch (error: any) {
      strapi.log.error("[strava] webhook processing error", error);
    }
  },
}));
