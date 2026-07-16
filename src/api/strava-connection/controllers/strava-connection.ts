/**
 * strava-connection controller
 *
 * Schema + permissions prepared; OAuth/sync endpoints come in a later phase.
 */

import { factories } from "@strapi/strapi";
import {
  getAuthenticatedUserWithClub,
  formatAthlete,
} from "../../../utils/running-app";

const UID = "api::strava-connection.strava-connection";

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

export default factories.createCoreController(UID, ({ strapi }) => ({
  async appStatus(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized("Authentication required");

    const actor = await getAuthenticatedUserWithClub(strapi, authUser.id);
    if (!actor) return ctx.unauthorized("Authentication required");

    const connections = (await strapi.entityService.findMany(UID, {
      filters: { user: { id: { $eq: actor.id } } },
      limit: 1,
      populate: { user: true },
    } as any)) as any[];

    return ctx.send({
      data: formatConnection(connections[0] || null),
      meta: {
        oauthReady: false,
        note: "Strava OAuth y sync incremental se implementan en una fase posterior. El modelo ya admite source=strava en running-activity.",
      },
    });
  },
}));
