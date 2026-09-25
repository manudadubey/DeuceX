// The '@deucex/actions/notifications' subpath: step 5.2's notification
// email and push senders. Off the main barrel for the same reason as
// './account': push-client.ts imports the real 'web-push' SDK, and the main
// barrel reaches apps/web's client bundle. apps/api is the only consumer.

export {
  createWebPushClient,
  PushSendFailedError,
  type PushClient,
  type PushSubscriptionKeys,
} from './push-client';

export {
  sendNotificationEmail,
  sendNotificationPush,
  sendWeeklyDigest,
  sendStaffAlertEmail,
  notificationEmailHtml,
  digestEmailHtml,
  DeliveryNotPendingError,
  MAX_DELIVERY_ATTEMPTS,
  type DeliveryRecord,
  type NotificationDeliveryDb,
  type DigestDb,
} from './notifications';
