/**
 * Strict public projections of the existing server-only private inboxes.
 * Only opaque notification IDs, safe display text and server-issued cursors
 * may enter the React view. No Firestore client notification queries.
 */
export const NOTICE_ID = /^[a-f0-9]{64}$/;
const CAMPAIGN_ID = /^[A-Za-z0-9_-]{1,160}$/;
const SOCIAL_KINDS = new Set([
  'incoming-request','request-accepted','request-declined','request-cancelled',
  'friend-removed','player-blocked','player-unblocked'
]);
const CAMPAIGN_KINDS = new Set([
  'join-request','join-approved','join-declined','email-invitation','friend-invitation'
]);
const exact = (record, keys) =>
  record && typeof record === 'object' && !Array.isArray(record) &&
  Object.keys(record).sort().join(',') === [...keys].sort().join(',');
const saneDate = value => typeof value === 'string' &&
  value.length >= 10 && value.length <= 40 &&
  Number.isFinite(Date.parse(value));
const saneText = (value, max) => typeof value === 'string' &&
  value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

export function notificationChannel(value) {
  if(value !== 'social' && value !== 'campaign')
    throw new Error('Unknown notification channel.');
  return value;
}
export function notificationCursor(value) {
  if(value !== null && !(typeof value === 'string' && NOTICE_ID.test(value)))
    throw new Error('Invalid private notification cursor.');
  return value;
}
export function notificationId(value) {
  if(typeof value !== 'string' || !NOTICE_ID.test(value))
    throw new Error('Invalid private notification.');
  return value;
}

export function validateNotice(item, channel) {
  notificationChannel(channel);
  if(!item || typeof item !== 'object') throw new Error('Invalid notification.');
  const social = channel === 'social';
  const invite = !social && item.kind === 'friend-invitation';
  const fields = ['notificationId','kind','title','body','createdAt','readAt',
    ...(social ? [] : ['campaignId',...(invite ? ['inviteId'] : [])])];
  if(!exact(item,fields) || !NOTICE_ID.test(item.notificationId) ||
    !(social ? SOCIAL_KINDS : CAMPAIGN_KINDS).has(item.kind) ||
    !saneText(item.title,150) || !saneText(item.body,500) ||
    !saneDate(item.createdAt) ||
    !(item.readAt === null || saneDate(item.readAt)) ||
    (!social && (!CAMPAIGN_ID.test(item.campaignId) ||
      (invite && !NOTICE_ID.test(item.inviteId)))))
    throw new Error('Invalid notification result.');
  return Object.freeze({
    notificationId:item.notificationId,kind:item.kind,
    title:item.title,body:item.body,createdAt:item.createdAt,readAt:item.readAt,
    ...(!social ? {campaignId:item.campaignId} : {}),
    ...(invite ? {inviteId:item.inviteId} : {})
  });
}

export function validateNotificationPage(result, channel, cursor = null) {
  notificationChannel(channel);
  notificationCursor(cursor);
  if(!exact(result,['notifications','unreadShown','nextCursor']) ||
    !Array.isArray(result.notifications) || result.notifications.length > 25 ||
    !Number.isSafeInteger(result.unreadShown) ||
    result.unreadShown < 0 || result.unreadShown > result.notifications.length)
    throw new Error('Invalid notification page.');
  notificationCursor(result.nextCursor);
  if(result.nextCursor !== null && result.nextCursor === cursor)
    throw new Error('Invalid notification page cursor.');
  const seen = new Set();
  const notifications = result.notifications.map(item=>{
    const notice=validateNotice(item,channel);
    if(seen.has(notice.notificationId))throw new Error('Duplicate notification.');
    seen.add(notice.notificationId);
    return notice;
  });
  if(notifications.filter(item=>item.readAt===null).length !== result.unreadShown)
    throw new Error('Invalid unread notification count.');
  if(result.nextCursor !== null && notifications.length !== 25)
    throw new Error('Invalid notification pagination.');
  return Object.freeze({
    notifications:Object.freeze(notifications),unreadShown:result.unreadShown,
    nextCursor:result.nextCursor
  });
}
export function validateNoticeAcknowledgement(value,id) {
  notificationId(id);
  if(!exact(value,['notificationId','readAt','alreadyRead']) ||
    value.notificationId !== id || !saneDate(value.readAt) ||
    typeof value.alreadyRead !== 'boolean')
    throw new Error('Invalid notification acknowledgement.');
  return Object.freeze({
    notificationId:id,readAt:value.readAt,alreadyRead:value.alreadyRead
  });
}
export function firstPageUnread(feeds, channels) {
  return channels.reduce((total,channel)=>{
    const page=feeds?.[channel]?.page;
    return total+(page ? page.unreadShown : 0);
  },0);
}
export function notificationDestination(channel, kind) {
  if(channel==='social') {
    return {
      'incoming-request':'#/account/friends','request-accepted':'#/account/friends',
      'request-declined':'#/account/friends','request-cancelled':'#/account/friends',
      'friend-removed':'#/account/friends','player-blocked':'#/account/friends',
      'player-unblocked':'#/account/friends'
    }[kind] || null;
  }
  // No invitation token can be reconstructed from a notification. Campaign
  // Forge remains a protected placeholder until its independent migration.
  if(channel==='campaign' && ['join-request','join-approved','join-declined'].includes(kind))
    return '#/campaign-forge';
  return null;
}
