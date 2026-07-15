export default {
  routes: [
    {
      method: "GET",
      path: "/app/notifications",
      handler: "notification.appList",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/app/notifications/unread-count",
      handler: "notification.appUnreadCount",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "PUT",
      path: "/app/notifications/read-all",
      handler: "notification.appMarkAllRead",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "PUT",
      path: "/app/notifications/:notificationId/read",
      handler: "notification.appMarkRead",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/app/push/vapid-public-key",
      handler: "notification.appVapidPublicKey",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/app/push/subscribe",
      handler: "notification.appSubscribePush",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "DELETE",
      path: "/app/push/subscribe",
      handler: "notification.appUnsubscribePush",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
