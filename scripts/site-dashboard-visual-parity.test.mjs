import './site-dashboard-journal-parity.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
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
test('Phase 4.1 matches final legacy border sizes, plaque rails and content containers',()=>{
  const original=read('css/asteria-dashboard-responsive-content.css');
  const plaque=read('css/asteria-panel-headers.css');
  const css=read('frontend/src/layout/DashboardLayoutWorkspace.module.css');
  assert.ok(original.includes('--asteria-frame-border:clamp(9px,2cqi,18px)'));
  assert.ok(css.includes('--ast-dashboard-frame-border:clamp(9px,2cqi,18px)'));
  assert.ok(css.includes('border:var(--ast-dashboard-frame-border) solid transparent'));
  assert.ok(css.includes('border-image-width:1'));
  assert.ok(css.includes('top:calc(var(--ast-dashboard-frame-border) * var(--ast-dashboard-header-rail-ratio))'));
  for(const ratio of ['.333333','.833333','.233333']){
    assert.ok(plaque.includes('--asteria-header-rail-ratio:'+ratio));
    assert.ok(css.includes('--ast-dashboard-header-rail-ratio:'+ratio));
  }
  assert.ok(css.includes('container-name:asteria-panel;container-type:inline-size'));
  assert.doesNotMatch(css,/--ast-dashboard-header-rail-y/);
});
test('Phase 4.1 HP SP MP controls reuse approved icon crystal rather than rectangles',()=>{
  const jsx=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const css=read('frontend/src/pages/PlayerDashboardPage.module.css');
  assert.ok(jsx.includes('<CrystalButton size="icon" aria-label={\'Decrease \''));
  assert.ok(jsx.includes('<CrystalButton size="icon" aria-label={\'Increase \''));
  assert.match(css,/\.coreColumn \.resourceActions button\{[^}]*background:transparent;border:0;box-shadow:none/);
  assert.doesNotMatch(css,/\.coreColumn \.resourceActions button\{[^}]*background:rgb/);
});
test('Phase 4.3 saved layouts depend on workspace width, as in the approved original',()=>{
  const old=read('src/components/DashboardCustomisation.jsx');
  const current=read('frontend/src/layout/DashboardLayoutWorkspace.jsx');
  assert.match(old,/ResizeObserver\(update\)/);
  assert.match(old,/getBoundingClientRect\(\)\.width/);
  assert.match(current,/new ResizeObserver\(refresh\)/);
  assert.match(current,/workspaceRef=useRef\(null\)/);
  assert.match(current,/getBoundingClientRect\(\)\.width\|\|window\.innerWidth/);
  assert.match(current,/ref=\{workspaceRef\}/);
  assert.match(current,/observer\?\.disconnect\(\)/);
});
test('Phase 4.3 original armour and equipment content breakpoints are retained',()=>{
  const old=read('css/asteria-dashboard-responsive-content.css');
  const current=read('frontend/src/player/PlayerOverviewPanels.module.css');
  for(const w of [520,420,300,260]){
    assert.ok(old.includes('(max-width:'+w+'px)'),w+' original breakpoint');
    assert.ok(current.includes('(max-width:'+w+'px)'),w+' React breakpoint');
  }
  for(const declaration of [
    '.armourClass{grid-column:1/-1;grid-row:1;min-height:76px}',
    '.armourSlots:first-child{grid-column:1;grid-row:2}',
    '.armourSlots:last-child{grid-column:1;grid-row:3}',
    '.weaponSlots{grid-template-columns:minmax(0,1fr)}',
    '.slotArt{width:26px;height:30px}'
  ])assert.ok(current.includes(declaration),declaration);
});
test('Phase 4.3 CI captures all six authenticated React role/width pairs',()=>{
  const script=read('scripts/site-layout-phase6-3-browser.cjs');
  for(const name of ['player-mobile','player-desktop','gm-mobile','gm-desktop',
    'gm-readonly-mobile','gm-readonly-desktop'])assert.ok(script.includes("'"+name+"'"),name);
  assert.ok(script.includes('captureResponsiveLayoutEvidence'));
});
test('Phase 4.4 captures the full approved dashboard shell in six authenticated cases',()=>{
  const browser=read('scripts/site-layout-phase6-3-browser.cjs');
  const player=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  const workflow=read('.github/workflows/frontend-phase6-3-acceptance.yml');
  assert.ok(player.includes('data-testid="site-player-hero"'));
  assert.ok(gm.includes('data-testid="site-gm-hero"'));
  assert.ok(gm.includes('data-testid="site-gm-party-sidebar"'));
  assert.ok(browser.includes("name+'-full-page.png'"));
  assert.ok(browser.includes("name+'-shell.json'"));
  assert.ok(browser.includes('Rectangular navigation background returned'));
  assert.ok(browser.includes('GM party/resource sidebar missing'));
  assert.ok(browser.includes('HP/SP/MP colors differ from original'));
  assert.ok(workflow.includes('asteria-phase-4-4-full-dashboard-evidence'));
});
test('Phase 4.4 original-vs-React visual gate rejects substituted references and cropped views',()=>{
  const gate=read('scripts/site-dashboard-approved-screenshot-parity.cjs');
  for(const text of [
    "const {createHash}=require('node:crypto')",
    'Duplicate role and viewport reference',
    'Approved legacy screenshot reviewer must be identified',
    'Authentic original source commit SHA must be documented',
    'Original screenshot SHA-256 is required',
    'Approved original reference hash mismatch',
    'Visual comparisons must capture the complete authenticated dashboard',
    'site-player-dashboard',
    'site-gm-dashboard',
    "name+'-comparison.json'"
  ])assert.ok(gate.includes(text),text);
});
test('Phase 4.5 never certifies original screenshot parity when references are missing',()=>{
  const require=createRequire(import.meta.url);
  const {auditReferences,REQUIRED_PAIRS}=require('./site-dashboard-reference-preflight.cjs');
  const result=auditReferences(null);
  assert.equal(result.status,'blocked');
  assert.equal(REQUIRED_PAIRS.length,6);
  assert.equal(result.verifiedReferences,0);
  for(const pair of REQUIRED_PAIRS)
    assert.ok(result.blockers.some(text=>text.includes(pair)),pair);
  const missing=auditReferences('/not/a/real/dashboard-approved-original-manifest.json');
  assert.equal(missing.status,'blocked');
  assert.equal(missing.verifiedReferences,0);
});
test('Phase 4.5 comparator uses complete pages and strict manual release gating',()=>{
  const gate=read('scripts/site-dashboard-approved-screenshot-parity.cjs');
  const browser=read('scripts/site-layout-phase6-3-browser.cjs');
  const check=read('scripts/site-dashboard-reference-preflight.cjs');
  const pkg=JSON.parse(read('package.json'));
  assert.ok(gate.includes("const {auditReferences}=require('./site-dashboard-reference-preflight.cjs')"));
  assert.ok(gate.includes('readiness.status'));
  assert.ok(gate.includes("page.screenshot({fullPage:true,animations:'disabled'})"));
  assert.ok(!gate.includes('target.screenshot({animations:'));
  assert.ok(browser.includes("name+'-full-page.png'"));
  assert.ok(check.includes('PNG_MAGIC'));
  assert.ok(check.includes("createHash('sha256')"));
  assert.ok(pkg.scripts['site:dashboard-release-visual-gate'].includes('--require-ready'));
  assert.ok(pkg.scripts['site:dashboard-release-visual-gate'].includes('site:dashboard-approved-screenshot-parity'));
});
test('Midnight Obsidian HP SP MP resource bars use shared glossy source tokens',()=>{
  const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  const tokens=read('frontend/src/styles/tokens.css');
  const playerCss=read('frontend/src/pages/PlayerDashboardPage.module.css');
  const gmCss=read('frontend/src/pages/GMDashboardPage.module.css');
  const oldTokens=read('css/asteria-design-tokens.css');
  const oldCss=read('src/styles/asteria-react.css');
  const oldModern=read('css/asteria-modern-ui.css');
  const oldSheet=read('css/styles.css');
  assert.match(page,/role="progressbar"/);
  assert.match(gm,/role="progressbar"/);
  assert.doesNotMatch(page,/<progress aria-label=\{key\.toUpperCase\(\)\+' resources'/);
  for(const [kind,base,highlight,shadow] of [
    ['hp','#94112d','#dc4967','#700b22'],
    ['sp','#007545','#38bd8c','#005332'],
    ['mp','#203f8b','#7896eb','#162e67']
  ]){
    for(const [prefix,source] of [['--ast-resource-',tokens],['--asteria-',oldTokens]]){
      for(const [suffix,value] of [['',base],['-highlight',highlight],['-shadow',shadow]])
        assert.ok(source.includes(`${prefix}${kind}${suffix}: ${value};`),kind+suffix);
    }
    assert.ok(tokens.includes(`--ast-resource-${kind}-fill:`));
    assert.ok(oldTokens.includes(`--asteria-${kind}-gradient:`));
    assert.ok(playerCss.includes(`var(--ast-resource-${kind}-fill)`));
    assert.ok(gmCss.includes(`var(--ast-resource-${kind}-fill)`));
    assert.ok(oldCss.includes(`var(--asteria-${kind}-gradient`));
    assert.ok(oldModern.includes(`var(--asteria-${kind}-gradient`));
    assert.ok(oldSheet.includes(`var(--asteria-${kind}-gradient`));
  }
  assert.match(tokens,/--ast-resource-gloss: linear-gradient/);
  assert.match(oldTokens,/--asteria-resource-gloss: linear-gradient/);
  assert.match(playerCss,/box-shadow:inset 0 1px 0/);
  assert.match(gmCss,/box-shadow:inset 0 1px 0/);
  assert.doesNotMatch(playerCss,/rgb\(237 88 138\)|rgb\(42 216 167\)|rgb\(52 191 242\)/);
});
test('forged Level shield and four combat silhouettes preserve original paths with one reversible finish',()=>{
  const source=read('frontend/src/components/ui/ForgedBadge.jsx');
  const material=read('frontend/src/components/ui/ForgedBadge.module.css');
  const tokens=read('frontend/src/styles/tokens.css');
  const old=read('src/dashboards/CombatPanel.jsx');
  const player=read('frontend/src/pages/PlayerDashboardPage.jsx');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  const combat=read('frontend/src/combat/CombatWorkspace.jsx');
  for(const kind of ['level','order','initiative','ap','timer']){
    assert.ok(source.includes(kind+":'"),kind);
    assert.ok(source.includes('site-forged-badge-'));
  }
  for(const path of [
    'M12 4H76L88 18V58L76 72H12V54H4V43H12V32H4V21H12Z',
    'M24 4H66L88 38L66 72H24L2 38Z',
    'M45 2L56 14L73 10L75 27L88 38L75 49L73 66L56 62L45 74L34 62L17 66L15 49L2 38L15 27L17 10L34 14Z',
    'M4 9H86V23L69 38L86 53V67H4V53L21 38L4 23Z'
  ]){assert.ok(source.includes(path));assert.ok(old.includes(path));}
  for(const key of ['--ast-badge-metal-light','--ast-badge-face-deep',
    '--ast-badge-accent-level','--ast-badge-accent-ap'])assert.ok(tokens.includes(key+':'));
  assert.ok(material.includes("[data-warning='true']"));
  assert.ok(material.includes('prefers-reduced-motion:reduce'));
  assert.ok(player.includes('<ForgedBadge kind="level"'));
  assert.ok(gm.includes('<ForgedBadge kind="level"'));
  assert.ok(combat.includes('function CombatStatusBadges'));
  assert.match(combat,/kind="timer"/);
  assert.doesNotMatch(material,/!important|:global\(/);
});
test('original player navigation remains enumerated rather than silently removed',()=>{
  const jsx=read('frontend/src/pages/PlayerDashboardPage.jsx');
  for(const label of ['Dashboard','Character','Class/Talent Tree','Skills','Spells',
    'Inventory','Crafting','Quests','News / Events / History','Journal','Party',
    'Gallery','Battle Maps','Advanced Dice','Calendar','Weather','World Map',
    'Campaign Library','Campaign Audio','Recording & Archives','Dashboard Settings'])
    assert.ok(jsx.includes("'"+label+"'"),label);
  assert.doesNotMatch(jsx,/not yet connected to the new React route/);
  assert.ok(jsx.includes('This workspace is unavailable for the current account or campaign'));
  assert.ok(jsx.includes('mediaEnabled=Boolean(c&&media?.availability().enabled)'));
  assert.ok(jsx.includes("tab==='News / Events / History'&&!campaign"));
  assert.ok(jsx.includes("mediaEnabled&&['Battle Maps','World Map']"));
  assert.ok(jsx.includes("progressionEnabled&&['Progression','Skills','Class/Talent Tree','Check History']"));
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

test('Phase 3.6 approved visual parity requires authenticated role and device evidence',()=>{
  const gate=read('scripts/site-dashboard-approved-screenshot-parity.cjs');
  assert.ok(gate.includes("for(const role of ['player','gm','readonly'])"));
  assert.ok(gate.includes('width<=480'));
  assert.ok(gate.includes('width>=1024'));
  assert.ok(gate.includes('GM Read-only'));
  assert.ok(gate.includes('Approved reference PNG missing'));
  assert.ok(gate.includes('pixel.difference<=max'));
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
