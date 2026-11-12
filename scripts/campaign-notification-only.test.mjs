import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readManifest} from './asteria-release-source.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('one canonical notification-only invitation channel, external email deferred',()=>{
 const manifest=readManifest();
 assert.deepEqual(manifest.invitationDelivery,{
   active:'in-app-notifications-only',emailInvitations:'deferred',resendRequired:false
 });
 assert.equal(manifest.websiteFlags.emailInvitationControls,false);
 assert.equal(manifest.websiteFlags.friendNotificationsEnabled,true);
 assert.equal(manifest.websiteFlags.campaignNotifications,false);
});
test('production callable entrypoint uses no email provider or Resend secret',()=>{
 const src=read('functions/index.mjs');
 assert.doesNotMatch(src,/ASTERIA_RESEND_API_KEY|asteriaResendApiKeySecret|export const asteriaCampaignEmailInvitations=/);
 assert.match(src,/export const asteriaCampaignNotifications=onCall/);
 assert.match(src,/action==='issue-friend'/);
 assert.match(src,/AST.ERIA_CAMPAIGN_NOTIFICATIONS_ENABLED!=='1'/);
 assert.match(src,/action\.endsWith\('-notification'\)/);
 assert.match(src,/notificationOnly:noticeOnly/);
 assert.match(src,/token:discardedToken/);
 assert.match(src,/return safe;/);
});
test('campaign frontend has no email invitation sending or provider dependencies',()=>{
 const manager=read('js/clean-compendium.js');
 const auth=read('js/firebase-auth.js');
 assert.doesNotMatch(manager,/workspaceEmailInviteSend|workspaceEmailInviteRecipients|workspaceSecureInviteEmail|Send Email Invitations|Replace and Resend/);
 assert.doesNotMatch(auth,/sendCampaignEmailInvitations: async|resendCampaignEmailInvitation: async/);
 assert.match(auth,/previewCampaignNotificationInvitation: async/);
 assert.match(auth,/acceptCampaignNotificationInvitation: async/);
 const friend=read('js/asteria-campaign-friend-recipients.js');
 assert.match(friend,/Send Asteria Invitation/);
 assert.match(friend,/result\.token!==undefined/);
 assert.doesNotMatch(friend,/Copy Private Invitation Link|Copy One-Time Invitation Link/);
 const notices=read('js/campaign-notifications-ui.js');
 assert.match(notices,/Review Campaign Invitation/);
 assert.match(notices,/api\.previewCampaignNotificationInvitation/);
 assert.match(notices,/api\.acceptCampaignNotificationInvitation/);
});
test('server writes recipient-only notices with no bearer, claims need server-side proof and GM review',()=>{
 const issuance=read('functions/campaignSecureInvitations.mjs');
 const notices=read('functions/campaignNotifications.mjs');
 const acceptance=read('functions/campaignInvitationAcceptance.mjs');
 assert.match(issuance,/bindingKind==='friend-account'&&options\.notificationsEnabled===true/);
 assert.match(issuance,/enqueueCampaignNotification\(tx,db,boundUid/);
 assert.match(issuance,/assertNotifiedFriendInvitationEligible/);
 assert.match(notices,/assertFriendInvitationNotice/);
 assert.match(notices,/value\.inviteId!==inviteId/);
 assert.match(acceptance,/assertFriendInvitationNotice\(db,uid,\{campaignId,inviteId\},tx\)/);
 assert.match(acceptance,/status:'pending'/);
 assert.doesNotMatch(notices,/tokenDigest:\s*|token:\s*/);
});
test('trusted deployment installs notification callable without Resend or Firebase email function',()=>{
 const wf=read('.github/workflows/firebase-deploy.yml');
 const section=wf.split(/^  campaign_channels_deploy_disabled:\s*$/m)[1]
   ?.split(/^  campaign_friends_release:\s*$/m)[0]||'';
 assert.match(section,/campaign-notifications-deploy-disabled/);
 assert.match(section,/functions:asteria:asteriaCampaignNotifications/);
 assert.doesNotMatch(section,/gcloud secrets|ASTERIA_RESEND_API_KEY|asteriaCampaignEmailInvitations/);
});
