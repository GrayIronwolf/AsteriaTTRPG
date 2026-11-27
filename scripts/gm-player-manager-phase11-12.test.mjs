import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  gmPlayerManagerAccess,gmPlayerManagerRoster,gmPlayerManagerFilter,gmPlayerManagerPage
} from '../src/state/gmPlayerManagerModel.mjs';
import {gmVerifiedPlayerCharacters,gmPlayerOperationsEnabled} from '../src/state/gmPlayerOperationsModel.mjs';
import {
  GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG,
  defaultGMCanvasLayout,normalizeGMCanvasLayout
} from '../src/state/dashboardLayoutModel.mjs';

const file=path=>readFileSync(path,'utf8');
const campaign={
  id:'campaign-one',membershipSchemaVersion:2,ownerUid:'owner',
  gmUids:['old-legacy'],roles:{'old-legacy':'gm'},
  playerCharacterLinks:{pc1:'player-a'},
  characters:{pc1:{ownerUid:'player-a'}},
  players:{'player-a':{characterIds:['pc1'],displayName:'Player A'}}
};
const co={id:'co',campaignId:campaign.id,uid:'co',role:'co-gm',status:'active'};
const baseMembers=[
  {id:'owner',uid:'owner',campaignId:campaign.id,role:'owner',status:'active'},
  co,{id:'player-a',uid:'player-a',campaignId:campaign.id,role:'player',status:'active'},
  {id:'player-b',uid:'player-b',campaignId:campaign.id,role:'player',status:'suspended'}
];
const pcs={pc1:{id:'pc1',name:'Mage',ownerUid:'player-a',sharedCampaignId:campaign.id}};

test('GM owner/Co-GM authorization is campaign scoped, fail closed and never trusts presence',()=>{
  const flags={campaignPlayerRoster:true,campaignMemberControls:true,campaignRolePermissions:true};
  assert.equal(gmPlayerManagerAccess({campaign,actorUid:'owner',flags}).gm,true);
  assert.equal(gmPlayerManagerAccess({campaign,actorUid:'co',membership:co,flags}).gm,true);
  for(const membership of [
    null,{...co,status:'suspended'},{...co,status:'banned'},
    {...co,campaignId:'campaign-two'},{...co,uid:'attacker'},
    {...co,role:'player'}
  ]){
    const access=gmPlayerManagerAccess({campaign,actorUid:'co',membership,flags});
    assert.equal(access.gm,false);
    assert.equal(access.roster,false);
    assert.equal(access.memberControls,false);
  }
  assert.equal(gmPlayerManagerAccess({campaign,actorUid:'old-legacy',flags}).gm,false);
  assert.equal(gmPlayerManagerAccess({campaign:{...campaign,membershipSchemaVersion:99},
    actorUid:'owner',flags}).gm,false);
  const legacy={...campaign,membershipSchemaVersion:1};
  assert.equal(gmPlayerManagerAccess({campaign:legacy,actorUid:'owner',flags}).roster,false);
  assert.equal(gmPlayerManagerAccess({campaign:legacy,actorUid:'old-legacy',flags}).gm,true);
});

test('canonical roster only accepts matching campaign documents; owner never doubles',()=>{
  const untrusted=[
    ...baseMembers,{...co,id:'forged',uid:'forged',campaignId:'campaign-two'},
    {...co,id:'co',uid:'co'}, // duplicate
    {id:'bad-owner',uid:'bad-owner',campaignId:campaign.id,role:'owner',status:'active'}
  ];
  const report=gmPlayerManagerRoster({campaign,characters:pcs,members:untrusted});
  assert.equal(report.state,'ready');
  assert.equal(report.summary.activeGMs,2);
  assert.equal(report.summary.activePlayers,1);
  assert.equal(report.summary.inactive,1);
  assert.equal(report.rows.length,4);
  assert.equal(report.rows.filter(row=>row.uid==='owner').length,1);
  assert.ok(report.issues.length>=2);
  assert.deepEqual(gmVerifiedPlayerCharacters({campaign,characters:pcs,report}).map(x=>x.id),['pc1']);
  const wrong=gmPlayerManagerRoster({campaign,characters:pcs,members:untrusted,serverRoster:{
    campaignId:'campaign-two',source:'canonical',active:[],inactive:[]
  }});
  assert.equal(wrong.server,false);
  assert.equal(gmPlayerManagerRoster({campaign,characters:pcs,members:null}).state,'loading');
  assert.equal(gmPlayerManagerRoster({campaign,characters:pcs,members:null,rosterError:'denied'}).state,'error');
});

test('online filtering is display-only and does not change roles or verified links',()=>{
  const presence={'one':{uid:'player-a',state:'online'},
    'two':{characterId:'pc1',state:'online'},
    'three':{uid:'co',state:'offline'}};
  const report=gmPlayerManagerRoster({campaign,characters:pcs,members:baseMembers,presence});
  const online=gmPlayerManagerFilter(report,{onlyOnline:true});
  assert.deepEqual(online.rows.map(row=>row.uid),['player-a']);
  assert.equal(online.summary.activeGMs,2);
  assert.equal(online.summary.activePlayers,1);
  const query=gmPlayerManagerFilter(report,{query:'mage'});
  assert.deepEqual(query.rows.map(row=>row.uid),['player-a']);
  assert.equal(query.total,4);
  assert.equal(query.matchCount,1);
  assert.equal(gmPlayerManagerFilter(report,{status:'suspended'}).rows[0].uid,'player-b');
  assert.equal(gmPlayerManagerFilter(report,{role:'co-gm'}).rows[0].uid,'co');
  const access=gmPlayerManagerAccess({campaign,actorUid:'co',membership:null});
  assert.equal(access.gm,false);
  assert.equal(gmPlayerOperationsEnabled({access,selected:{status:'active'},session:{editable:true}}),false);
});

test('pagination limits mounted cards without modifying source or membership count',()=>{
  const records=Array.from({length:63},(_,i)=>({
    uid:'u'+String(i).padStart(3,'0'),role:'player',status:'active',online:i%2===0,
    characters:[]
  }));
  const report={state:'ready',rows:records,total:63,summary:{activePlayers:63}};
  const p1=gmPlayerManagerPage(report,1,12);
  const p2=gmPlayerManagerPage(report,2,12);
  const last=gmPlayerManagerPage(report,999,12);
  assert.equal(p1.rows.length,12);
  assert.equal(p2.rows.length,12);
  assert.equal(p2.rows[0].uid,records[12].uid);
  assert.equal(last.page,6);
  assert.equal(last.rows.length,3);
  assert.equal(last.to,63);
  assert.equal(report.rows.length,63);
  assert.equal(gmPlayerManagerPage(report,-5,8).page,1);
  assert.equal(gmPlayerManagerPage(report,1,999).pageSize,12);
  assert.equal(gmPlayerManagerPage({...report,rows:[]},1,12).from,0);
});

test('large presence/roster updates keep stable results and do not duplicate users',()=>{
  const playerCount=400;
  const members=Array.from({length:playerCount},(_,i)=>({
    id:'u'+i,uid:'u'+i,campaignId:campaign.id,role:'player',status:'active'
  }));
  const presence=Object.fromEntries(Array.from({length:1500},(_,i)=>[
    'presence-'+i,{uid:'u'+(i%playerCount),state:i%3===0?'online':'offline'}
  ]));
  const report=gmPlayerManagerRoster({campaign,characters:{},members,presence});
  assert.equal(report.total,playerCount+1);
  assert.equal(report.summary.activePlayers,playerCount);
  assert.equal(new Set(report.rows.map(x=>x.uid)).size,report.rows.length);
  const onlyOnline=gmPlayerManagerFilter(report,{onlyOnline:true});
  assert.ok(onlyOnline.matchCount>0&&onlyOnline.matchCount<report.total);
  assert.equal(gmPlayerManagerPage(onlyOnline,2,24).rows.length<=24,true);
});

test('optional GM canvas Player Manager entry preserves existing layout and player allowlist',()=>{
  assert.ok(GM_DASHBOARD_CANVAS_CONFIG.ids.includes('playerManagerQuick'));
  assert.ok(!GM_DASHBOARD_CANVAS_CONFIG.defaultHidden.every(x=>x!=='playerManagerQuick'));
  assert.ok(!PLAYER_DASHBOARD_CANVAS_CONFIG.ids.includes('playerManagerQuick'));
  const defaults=defaultGMCanvasLayout();
  const normalized=normalizeGMCanvasLayout(defaults);
  assert.ok(normalized.hidden.includes('playerManagerQuick'));
  assert.ok(GM_DASHBOARD_CANVAS_CONFIG.categories.some(x=>
    x.panels.includes('playerManagerQuick')));
  const gm=file('src/dashboards/GMDashboard.jsx');
  const quick=file('src/dashboards/GMDashboardQuickPanels.jsx');
  assert.match(gm,/case 'playerManagerQuick'/);
  assert.match(quick,/gmCampaignMemberSummary/);
  assert.match(quick,/onNavigate\('player-manager'\)/);
  assert.doesNotMatch(quick,/firebaseService\.moderateCampaignMember/);
});

test('responsive accessibility and bounded rendering are covered without activating server gates',()=>{
  const ui=file('src/dashboards/GMPlayerManager.jsx');
  const css=file('src/styles/gm-player-manager.css');
  const html=file('index.html');
  assert.match(ui,/useDeferredValue\(query\)/);
  assert.match(ui,/gmPlayerManagerFilter\(fullReport/);
  assert.match(ui,/gmPlayerManagerPage\(report/);
  assert.match(ui,/page\.rows\.map\(/);
  assert.match(ui,/Online presence only/);
  assert.match(ui,/aria-label="Player roster pages"/);
  assert.match(ui,/aria-current=\{view===item\.id/);
  assert.match(css,/@container gm-player \(max-width:540px\)/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/prefers-reduced-motion/);
  for(const flag of ['campaignPlayerRoster','campaignMemberControls','campaignRolePermissions',
    'campaignCharacterApproval','campaignCharacterLifecycle'])
    assert.match(html,new RegExp(flag+':false'));
});
