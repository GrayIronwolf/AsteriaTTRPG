import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Phase 8.1 loads only additive, scoped campaign presentation styles',()=>{
  const html=read('index.html');
  const css=read('css/asteria-campaign-connection.css');
  assert.match(html,/css\/asteria-campaign-connection\.css\?v=phase8-1-20261109/);
  assert.ok(html.indexOf('asteria-campaign-connection.css')>
    html.indexOf('asteria-header-wordmark.css'));
  for(const selector of [
    '.workspace-campaign-join-card','.workspace-secure-invite-manager',
    '.workspace-player-roster','.workspace-campaign-notifications',
    '.react-gm-workspace-grid.campaign'
  ])assert.ok(css.includes(selector),selector+' styles should be scoped');
  assert.match(css,/@media \(max-width: 680px\)/);
  assert.match(css,/@media \(max-width: 520px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css,/@font-face|url\(/);
});

test('Campaign joining explicitly distinguishes legacy autojoin from GM requests',()=>{
  const source=read('js/clean-compendium.js');
  assert.match(source,/workspace-connection-steps/);
  assert.match(source,/aria-label="Campaign connection steps"/);
  assert.match(source,/legacy invitation system\. Confirming joins immediately/);
  assert.match(source,/Legacy invitations create a record and link only/);
  assert.match(source,/A link never grants campaign access by itself/);
  assert.match(source,/previewEnabled\?'Request GM approval':'Join legacy campaign'/);
});

test('Private notification rendering uses accessible states and safe DOM text',()=>{
  const source=read('js/campaign-notifications-ui.js');
  assert.match(source,/setAttribute\('role','list'\)/);
  assert.match(source,/setAttribute\('role','listitem'\)/);
  assert.match(source,/workspace-notice-state/);
  assert.match(source,/aria-busy/);
  assert.match(source,/new Intl\.DateTimeFormat/);
  assert.match(source,/api\.getUser\?\.\(\)\?\.uid===uid/);
  assert.match(source,/api\.markCampaignNotificationRead\(notice\.notificationId\)/);
  assert.match(source,/body\.textContent=String\(notice\.body/);
  const executable=source.split('\n').filter(line=>!line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(executable,/innerHTML|localStorage|sessionStorage|Notification\(/);
});

test('Roster and GM manager remain view-only except existing gated actions',()=>{
  const roster=read('js/campaign-roster-view.js');
  const manager=read('src/dashboards/GMWorkspacePanels.jsx');
  assert.match(roster,/workspace-roster-count/);
  assert.match(roster,/setAttribute\('role','group'\)/);
  assert.match(manager,/CampaignManagerWorkspace/);
  assert.match(manager,/Campaign Manager/);
  assert.match(roster,/handlers\.enableControls===true/);
  assert.match(roster,/handlers\.enableRoleControls===true/);
});

test('Phase 8.1 preserves disabled production connection feature flags',()=>{
  const html=read('index.html');
  for(const flag of ['campaignJoinPreview','campaignJoinRequests',
    'campaignJoinReview','campaignPlayerRoster','secureInvitationManager',
    'secureInvitationAcceptance','emailInvitationControls',
    'campaignNotifications']){
    const canary=new Set(['campaignJoinPreview','campaignJoinRequests',
      'campaignJoinReview','secureInvitationManager',
      'secureInvitationAcceptance','campaignNotifications']);
    if(canary.has(flag))
      assert.ok(html.includes(flag+':new URLSearchParams'),flag+' must require the canary URL');
    else assert.ok(html.includes(flag+':false'),flag+' must stay disabled');
    assert.ok(!html.includes(flag+':true'),flag+' must not be globally enabled');
  }
});
