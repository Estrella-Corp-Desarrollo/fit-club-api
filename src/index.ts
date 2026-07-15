import type { Core } from '@strapi/strapi';

const PUBLIC_PASSWORD_RECOVERY_ACTIONS = [
  'plugin::users-permissions.auth.forgotPassword',
  'plugin::users-permissions.auth.resetPassword',
];

const AUTHENTICATED_PASSWORD_ACTIONS = ['plugin::users-permissions.auth.changePassword'];
const AUTHENTICATED_PERSONAL_BEST_ACTIONS = [
  'api::personal-best.personal-best.me',
  'api::personal-best.personal-best.upsertMe',
  'api::personal-best.personal-best.updateMe',
];
const AUTHENTICATED_RACE_RESULT_ACTIONS = [
  'api::evento.evento.appFind',
  'api::evento.evento.appFindOne',
  'api::edition.edition.search',
  'api::participacion.participacion.me',
  'api::participacion.participacion.byEdition',
  'api::participacion.participacion.createMe',
  'api::participacion.participacion.updateMe',
];
const AUTHENTICATED_USER_ACTIONS = [
  'api::user.user.find',
  'api::user.user.findOne',
];
const AUTHENTICATED_NOTIFICATION_ACTIONS = [
  'api::notification.notification.appList',
  'api::notification.notification.appUnreadCount',
  'api::notification.notification.appMarkRead',
  'api::notification.notification.appMarkAllRead',
  'api::notification.notification.appVapidPublicKey',
  'api::notification.notification.appSubscribePush',
  'api::notification.notification.appUnsubscribePush',
];

const ensureRolePermissions = async (strapi: Core.Strapi, roleType: string, actions: string[]) => {
  const role = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: roleType },
  });

  if (!role) {
    strapi.log.warn(`${roleType} role not found; password permissions were not configured.`);
    return;
  }

  for (const action of actions) {
    const existingPermission = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({
        where: {
          action,
          role: { id: role.id },
        },
      });

    if (!existingPermission) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: {
          action,
          role: role.id,
        },
      });
    }
  }
};

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await ensureRolePermissions(strapi, 'public', PUBLIC_PASSWORD_RECOVERY_ACTIONS);
    await ensureRolePermissions(strapi, 'authenticated', [
      ...AUTHENTICATED_PASSWORD_ACTIONS,
      ...AUTHENTICATED_PERSONAL_BEST_ACTIONS,
      ...AUTHENTICATED_RACE_RESULT_ACTIONS,
      ...AUTHENTICATED_USER_ACTIONS,
      ...AUTHENTICATED_NOTIFICATION_ACTIONS,
    ]);
  },
};
