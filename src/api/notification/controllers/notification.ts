/**
 * notification controller
 */

import { factories } from "@strapi/strapi";

const NOTIFICATION_UID = "api::notification.notification";
const PUSH_SUBSCRIPTION_UID = "api::push-subscription.push-subscription";

const getPagination = (ctx) => {
  const page = Math.max(
    Number(ctx.query?.pagination?.page || ctx.query?.page || 1),
    1,
  );
  const pageSize = Math.min(
    Math.max(
      Number(ctx.query?.pagination?.pageSize || ctx.query?.pageSize || 20),
      1,
    ),
    50,
  );

  return {
    page,
    pageSize,
    start: (page - 1) * pageSize,
  };
};

export default factories.createCoreController(
  NOTIFICATION_UID,
  ({ strapi }) => ({
    async appList(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const { page, pageSize, start } = getPagination(ctx);
      const unreadOnly = String(ctx.query?.unreadOnly || "") === "true";

      const filters: any = {
        user: {
          id: {
            $eq: authUser.id,
          },
        },
      };

      if (unreadOnly) {
        filters.read = {
          $eq: false,
        };
      }

      const [items, total] = await Promise.all([
        strapi.entityService.findMany(NOTIFICATION_UID, {
          filters,
          limit: pageSize,
          start,
          sort: [{ createdAt: "desc" }],
        } as any),
        strapi.db.query(NOTIFICATION_UID).count({
          where: filters,
        }),
      ]);

      const notificationService = strapi.service(NOTIFICATION_UID);

      return ctx.send({
        data: (items as any[]).map(notificationService.formatNotification),
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.max(Math.ceil(total / pageSize), 1),
            total,
          },
        },
      });
    },

    async appUnreadCount(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const total = await strapi.db.query(NOTIFICATION_UID).count({
        where: {
          user: {
            id: authUser.id,
          },
          read: false,
        },
      });

      return ctx.send({
        data: {
          unreadCount: total,
        },
      });
    },

    async appMarkRead(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const identifier = String(ctx.params.notificationId || "").trim();
      const numericId = Number(identifier);
      const filters = Number.isInteger(numericId)
        ? { id: numericId }
        : { documentId: identifier };

      const notifications = (await strapi.entityService.findMany(
        NOTIFICATION_UID,
        {
          filters: {
            ...filters,
            user: {
              id: {
                $eq: authUser.id,
              },
            },
          },
          limit: 1,
        } as any,
      )) as any[];

      const notification = notifications[0];

      if (!notification) {
        return ctx.notFound("Notification not found");
      }

      const updated = await strapi.entityService.update(
        NOTIFICATION_UID,
        notification.id,
        {
          data: {
            read: true,
          },
        } as any,
      );

      return ctx.send({
        data: strapi.service(NOTIFICATION_UID).formatNotification(updated),
      });
    },

    async appMarkAllRead(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const unread = (await strapi.entityService.findMany(NOTIFICATION_UID, {
        filters: {
          user: {
            id: {
              $eq: authUser.id,
            },
          },
          read: {
            $eq: false,
          },
        },
        limit: 200,
      } as any)) as any[];

      await Promise.all(
        unread.map((item) =>
          strapi.entityService.update(NOTIFICATION_UID, item.id, {
            data: {
              read: true,
            },
          } as any),
        ),
      );

      return ctx.send({
        data: {
          updated: unread.length,
        },
      });
    },

    async appVapidPublicKey(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const publicKey = strapi.service(NOTIFICATION_UID).getVapidPublicKey();

      if (!publicKey) {
        return ctx.send({
          data: {
            publicKey: null,
            enabled: false,
          },
        });
      }

      return ctx.send({
        data: {
          publicKey,
          enabled: true,
        },
      });
    },

    async appSubscribePush(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const payload = ctx.request.body?.data || ctx.request.body || {};
      const endpoint = String(payload.endpoint || "").trim();
      const p256dh = String(payload.keys?.p256dh || payload.p256dh || "").trim();
      const auth = String(payload.keys?.auth || payload.auth || "").trim();
      const userAgent = String(payload.userAgent || "").trim();

      if (!endpoint || !p256dh || !auth) {
        return ctx.badRequest("Push subscription endpoint and keys are required");
      }

      const existing = (await strapi.entityService.findMany(
        PUSH_SUBSCRIPTION_UID,
        {
          filters: {
            endpoint: {
              $eq: endpoint,
            },
          },
          limit: 1,
        } as any,
      )) as any[];

      let subscription;

      if (existing[0]) {
        subscription = await strapi.entityService.update(
          PUSH_SUBSCRIPTION_UID,
          existing[0].id,
          {
            data: {
              user: {
                connect: [authUser.id],
              },
              p256dh,
              auth,
              userAgent: userAgent || existing[0].userAgent || null,
            },
          } as any,
        );
      } else {
        subscription = await strapi.entityService.create(
          PUSH_SUBSCRIPTION_UID,
          {
            data: {
              user: {
                connect: [authUser.id],
              },
              endpoint,
              p256dh,
              auth,
              userAgent: userAgent || null,
            },
          } as any,
        );
      }

      return ctx.send({
        data: {
          id: subscription.id,
          endpoint: subscription.endpoint,
        },
      });
    },

    async appUnsubscribePush(ctx) {
      const authUser = ctx.state.user;

      if (!authUser) {
        return ctx.unauthorized("Authentication required");
      }

      const payload = ctx.request.body?.data || ctx.request.body || {};
      const endpoint = String(payload.endpoint || "").trim();

      if (!endpoint) {
        return ctx.badRequest("endpoint is required");
      }

      const existing = (await strapi.entityService.findMany(
        PUSH_SUBSCRIPTION_UID,
        {
          filters: {
            endpoint: {
              $eq: endpoint,
            },
            user: {
              id: {
                $eq: authUser.id,
              },
            },
          },
          limit: 1,
        } as any,
      )) as any[];

      if (existing[0]) {
        await strapi.entityService.delete(PUSH_SUBSCRIPTION_UID, existing[0].id);
      }

      return ctx.send({
        data: {
          removed: Boolean(existing[0]),
        },
      });
    },
  }),
);
