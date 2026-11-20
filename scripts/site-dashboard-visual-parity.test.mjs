import './site-dashboard-journal-parity.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playerCharacterProjection,playerCampaignProjection} from '../frontend/src/player/playerDashboardModel.mjs';
import {gmCampaignSummary,gmPartySummary} from '../frontend/src/dashboard/gmDashboardModel.mjs';
import {safeDashboardArtwork} from '../src/state/playerHudMedia.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('approved image assets stay the original single dashboard style source',()=>{
  const css=read('frontend/src/layout/DashboardLayoutWorkspace.module.css');
  const grid=read('frontend/src/layout/DashboardLayoutWorkspace.jsx');
  for(const asset of ['panel-frame-3x3.webp','panel-frame-3x6.webp',
    'panel-frame-6x3.webp','panel-frame-9x3.webp',
    'panel-backdrop-obsidian.webp','panel-backdrop-slate.webp','panel-backdrop-arcane.webp','10004.png','10006.png']){
    assert.match(css,new RegExp(asset.replaceAll('.','\\.')));
  }
  assert.match(grid,/data-panel-size=\{\x60\$\{pos.w\}x\$\{pos.h\}\x60\}/);
});
test('player restores original portrait, campaign image, HP SP MP and 9 characteristics',()=>{
  const jsx=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const css=read('frontend/src/pages/PlayerDashboardPage.module.css');
  for(const marker of ['classicHeader','portraitColumn','coreColumn','campaignColumn','Resources','StatPanel','sessionStrip'])
    assert.ok(jsx.includes(marker),marker);
  assert.match(css,/grid-template-columns:minmax\(180px,30fr\)/);
  assert.doesNotMatch(jsx,/<h3>Dashboard Migration<\/h3>/);
});
test('GM has original resource sidebar, framed panels and reusable session backend',()=>{
  const jsx=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.match(jsx,/partySidebar/);
  assert.match(jsx,/ResourceMeter/);
  assert.match(jsx,/gmSessionCommands/);
  assert.match(jsx,/GMCombatWorkspace/);
});
test('only safe image URLs cross React projection boundary, never expose private GM data',()=>{
  const owner='owner-1',id='hero-1';
  const character=playerCharacterProjection({id,ownerUid:owner,name:'Hero',
    image:'https://example.com/hero.webp',journal:[{title:'secret',content:'PRIVATE'}]},
  {owned:false});
  assert.equal(character.image,'https://example.com/hero.webp');
  assert.deepEqual(character.journal,[]);
  assert.equal(safeDashboardArtwork('javascript:alert(1)'),'');
  assert.equal(safeDashboardArtwork('//evil.example/img.png'),'');
  const c={id:'campaign-1',name:'Campaign',image:'/assets/campaign.webp'};
  assert.equal(playerCampaignProjection(c,{allowed:true,isGM:false},null).image,'/assets/campaign.webp');
  assert.equal(gmCampaignSummary({...c,ownerUid:owner},{allowed:true,role:'owner'}).image,'/assets/campaign.webp');
  assert.equal(gmPartySummary([{id,name:'Hero',image:'https://example.com/hero.webp'}])[0].image,'https://example.com/hero.webp');
});

test('restored frame uses original square cell ratios, sliced artwork, and four frame families',()=>{
  const css=read('frontend/src/layout/DashboardLayoutWorkspace.module.css');
  const jsx=read('frontend/src/layout/DashboardLayoutWorkspace.jsx');
  assert.match(css,/grid-auto-rows: calc\(\(100cqw - 66px\) \/ 12\)/);
  assert.match(css,/border-image-source:\s*var\(--ast-dashboard-frame\)/);
  assert.match(css,/border-image-slice:\s*12%/);
  assert.doesNotMatch(css,/grid-auto-rows:minmax\(42px/);
  assert.match(jsx,/data-frame-family=\{frame\}/);
  for(const kind of ['wide','ultrawide','tall','square'])assert.ok(jsx.includes("'"+kind+"'"));
});
test('resource tracks are rendered with original HP SP MP colour roles',()=>{
  const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const css=read('frontend/src/pages/PlayerDashboardPage.module.css');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.match(page,/role="progressbar"/);
  assert.match(gm,/role="progressbar"/);
  assert.doesNotMatch(page,/<progress aria-label=\{key\.toUpperCase\(\)\+' resources'/);
  for(const selector of ["data-resource='sp'","data-resource='mp'"])
    assert.ok(css.includes(selector),selector);
  assert.match(css,/rgb\(237 88 138\)/);
  assert.match(css,/rgb\(42 216 167\)/);
  assert.match(css,/rgb\(52 191 242\)/);
});
test('original player navigation remains enumerated rather than silently removed',()=>{
  const jsx=read('frontend/src/pages/PlayerDashboardPage.jsx');
  for(const label of ['Dashboard','Character','Class/Talent Tree','Skills','Spells',
    'Inventory','Crafting','Quests','News / Events / History','Journal','Party',
    'Gallery','Battle Maps','Advanced Dice','Calendar','Weather','World Map',
    'Campaign Library','Campaign Audio','Recording & Archives','Dashboard Settings'])
    assert.ok(jsx.includes("'"+label+"'"),label);
  assert.match(jsx,/not yet connected to the new React route/);
  const css=read('frontend/src/pages/PlayerDashboardPage.module.css');
  assert.doesNotMatch(css,/\.tabs button\{[^}]*background:var\(--ast-color-panel-raised\)/);
});

test('GM navigation retains the 24 original destinations with scoped tool entry points',()=>{
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  for(const label of ['GM Main','GM Toolkit','NPC & Creature Library','Dashboard Settings',
    'PC Inventory','News & Events','Quests','GM Notes','Session Library',
    'Soundboard & Ambience','Session Recordings','Player Display','Economy',
    'Crafting','GM Tools','Gameplay Systems','World Systems','Battle Maps',
    'Advanced Dice','Random Tables','Encounter Generator','Asteria Calendar',
    'Weather Generator','World Atlas'])
    assert.ok(gm.includes("label:'"+label+"'"),'Missing original GM destination: '+label);
  assert.match(gm,/GMDigitalGMWorkspace/);
  assert.match(gm,/GMCombatWorkspace/);
  assert.match(gm,/GMEconomyWorkspace/);
  assert.match(gm,/GMChecksAndProgression/);
  assert.match(gm,/CampaignAtlasWorkspace/);
});
test('original campaign calendar and weather destinations use secured existing Digital GM service',()=>{
  const player=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const digital=read('frontend/src/digitalGM/DigitalGMWorkspace.jsx');
  for(const name of ['Calendar','Weather','Campaign Library','Campaign Audio','Recording & Archives'])
    assert.ok(player.includes("'"+name+"'"),name);
  assert.match(player,/initialSection=/);
  assert.match(digital,/initialSection='calendar'/);
  assert.match(digital,/initialArea='library'/);
});

test('original Advanced Dice uses existing server callable and private record',()=>{
  const service=read('frontend/src/dice/firebaseDiceService.mjs');
  const ui=read('frontend/src/dice/AdvancedDiceWorkspace.jsx');
  const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  const player=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.match(service,/asteriaAdvancedDice/);
  assert.match(service,/diceWorkspace','current'/);
  assert.match(service,/validateDiceAction/);
  assert.match(ui,/MAX_DICE_PRESETS/);
  assert.match(ui,/clear-history/);
  assert.match(ui,/diceExpression/);
  assert.match(player,/AdvancedDiceWorkspace/);
  assert.match(gm,/AdvancedDiceWorkspace/);
  assert.match(adapter,/createFirebaseDiceService/);
  assert.doesNotMatch(service,/window\.AsteriaFirebase|firebaseService|legacyBridge/);
});
test('Player resource adjustments run only through the original authenticated session callable',()=>{
  const service=read('frontend/src/player/firebasePlayerDashboardService.mjs');
  const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  const player=read('frontend/src/pages/PlayerDashboardPage.jsx');
  assert.match(service,/async function adjustResource/);
  assert.match(service,/relationship\.owned/);
  assert.match(service,/gmSessionState\(session\.data\(\)\)\.editable/);
  assert.match(service,/updateCampaignCharacterResource/);
  assert.match(service,/functionsSdk\.httpsCallable/);
  assert.match(adapter,/functionsSdk:safeFunctionsSdk/);
  assert.match(player,/Decrease /);
  assert.match(player,/Increase /);
});
