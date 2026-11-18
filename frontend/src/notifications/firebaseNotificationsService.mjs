import {
 notificationChannel,notificationCursor,notificationId,
 validateNotificationPage,validateNoticeAcknowledgement
} from './notificationContracts.mjs';

/** One existing Firebase Auth/Functions client; server owns inbox permissions. */
export function createFirebaseNotificationsService({auth,functions,functionsSdk,flags}) {
  if(!auth || !functions || typeof functionsSdk?.httpsCallable !== 'function' || !flags)
    throw new TypeError('Notifications require the existing Firebase clients.');
  const channels=Object.freeze({
    social:flags.social===true,campaign:flags.campaign===true
  });
  const currentUid=()=>auth.currentUser?.uid || null;
  const availability=()=>Object.freeze({...channels,
    enabled:channels.social || channels.campaign});
  async function call(channel,data) {
    notificationChannel(channel);
    if(!channels[channel])throw new Error('This notification inbox is disabled.');
    const uid=currentUid();
    if(!uid)throw new Error('Sign in to access notifications.');
    const callable=channel==='social' ? 'asteriaFriendNotifications'
      : 'asteriaCampaignNotifications';
    const response=await functionsSdk.httpsCallable(functions,callable)(data);
    if(currentUid()!==uid)
      throw new Error('Account changed during notification request.');
    return response?.data;
  }
  return Object.freeze({
    currentUid,availability,
    async list(channel,cursor=null){
      notificationCursor(cursor);
      return validateNotificationPage(await call(channel,{action:'list',cursor}),channel,cursor);
    },
    async markRead(channel,id){
      notificationId(id);
      return validateNoticeAcknowledgement(
        await call(channel,{action:'mark-read',notificationId:id}),id
      );
    }
  });
}
