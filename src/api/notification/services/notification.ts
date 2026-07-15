/**
 * notification service
 */

import { factories } from "@strapi/strapi";
import webpush from "web-push";

const NOTIFICATION_UID = "api::notification.notification";
const PUSH_SUBSCRIPTION_UID = "api::push-subscription.push-subscription";

const getVapidConfig = () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@fitclub.app";

  if (!publicKey || !privateKey) {
    return null;
  }

  return { publicKey, privateKey, subject };
};

const formatNotification = (notification) => ({
  id: notification.id,
  documentId: notification.documentId,
  title: notification.title,
  body: notification.body || "",
  type: notification.type || "general",
  link: notification.link || "/",
  read: Boolean(notification.read),
  createdAt: notification.createdAt,
});

export default factories.createCoreService(
  NOTIFICATION_UID,
  ({ strapi }) => ({
    formatNotification,

    getVapidPublicKey() {
      return getVapidConfig()?.publicKey || null;
    },

    async notifyUser({
      userId,
      title,
      body = "",
      type = "general",
      link = "/",
    }: {
      userId: number;
      title: string;
      body?: string;
      type?: string;
      link?: string;
    }) {
      if (!userId || !title) return null;

      const notification = await strapi.entityService.create(NOTIFICATION_UID, {
        data: {
          user: {
            connect: [userId],
          },
          title,
          body,
          type,
          link,
          read: false,
        },
      } as any);

      strapi
        .service(NOTIFICATION_UID)
        .sendPushToUser(userId, {
          title,
          body,
          link,
          notificationId: notification.id,
        })
        .catch((error) => {
          strapi.log.warn(
            `Push notification failed for user ${userId}: ${error?.message || error}`,
          );
        });

      return formatNotification(notification);
    },

    async notifyUsers(
      userIds: number[],
      payload: {
        title: string;
        body?: string;
        type?: string;
        link?: string;
      },
    ) {
      const uniqueIds = [...new Set((userIds || []).filter(Boolean))];

      await Promise.all(
        uniqueIds.map((userId) =>
          strapi.service(NOTIFICATION_UID).notifyUser({
            userId,
            ...payload,
          }),
        ),
      );
    },

    async sendPushToUser(
      userId: number,
      payload: {
        title: string;
        body?: string;
        link?: string;
        notificationId?: number;
      },
    ) {
      const vapid = getVapidConfig();

      if (!vapid) {
        return { sent: 0, skipped: true };
      }

      webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

      const subscriptions = (await strapi.entityService.findMany(
        PUSH_SUBSCRIPTION_UID,
        {
          filters: {
            user: {
              id: {
                $eq: userId,
              },
            },
          },
          limit: 50,
        } as any,
      )) as any[];

      if (!subscriptions.length) {
        return { sent: 0 };
      }

      const message = JSON.stringify({
        title: payload.title,
        body: payload.body || "",
        link: payload.link || "/",
        notificationId: payload.notificationId || null,
      });

      let sent = 0;

      for (const subscription of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            message,
          );
          sent += 1;
        } catch (error: any) {
          const statusCode = error?.statusCode || error?.status;

          if (statusCode === 404 || statusCode === 410) {
            await strapi.entityService.delete(
              PUSH_SUBSCRIPTION_UID,
              subscription.id,
            );
          } else {
            strapi.log.warn(
              `Web push error (${statusCode}): ${error?.message || error}`,
            );
          }
        }
      }

      return { sent };
    },
  }),
);
