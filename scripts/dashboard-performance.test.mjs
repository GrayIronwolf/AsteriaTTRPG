import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  defaultDashboardLayout,normalizeDashboardLayout,
  dashboardBackgroundForPanel,visibleDashboardPanels,toggleDashboardPanel,setDashboardBackground
} from '../src/state/dashboardLayoutModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const workspace=read('src/components/DashboardCustomisation.jsx');
const player=read('src/dashboards/PlayerDashboardOverview.jsx');
const gm=read('src/dashboards/GMDashboard.jsx');
const live=read('src/sessions/useCampaignLiveData.js');
const html=read('index.html');

test('dashboard workspace normalizes a layout once instead of per panel or background',()=>{
 assert.match(workspace,/const layout=React\.useMemo\(\(\)=>normalizeDashboardLayout\(raw,role\),\[raw,role\]\)/);
 assert.match(workspace,/const hidden=new Set\(layout\.hidden\)/);
 assert.match(workspace,/layout\.order\.filter\(id=>!hidden\.has\(id\)\)/);
 assert.match(workspace,/data-panel-background=\{layout\.panelBackgrounds\[id\]\|\|layout\.backgroundStyle\}/);
 const section=workspace.split('export function DashboardLayoutWorkspace')[1];
 assert.doesNotMatch(section,/dashboardBackgroundForPanel\(|visibleDashboardPanels\(/);
});

test('directly reused layout background/visibility values exactly match canonical helpers',()=>{
 for(const role of ['player','gm']){
  let layout=defaultDashboardLayout(role);
  const first=layout.order[0],optional=layout.order.find(id=>id.startsWith('shortcut'));
  layout=setDashboardBackground(layout,role,'slate');
  layout=setDashboardBackground(layout,role,'arcane',first);
  layout=toggleDashboardPanel(layout,role,first,false);
  layout=toggleDashboardPanel(layout,role,optional,true);
  const normalized=normalizeDashboardLayout(layout,role);
  const hidden=new Set(normalized.hidden);
  assert.deepEqual(normalized.order.filter(id=>!hidden.has(id)),visibleDashboardPanels(layout,role));
  for(const id of normalized.order)
   assert.equal(normalized.panelBackgrounds[id]||normalized.backgroundStyle,dashboardBackgroundForPanel(layout,role,id));
 }
});

test('Player preferences and GM talent catalogues ignore clock-only updates',()=>{
 assert.match(player,/normalizeDashboardPreferences\(\{dashboardPreferences:character\.dashboardPreferences\}\)/);
 assert.match(player,/\[character\.dashboardPreferences\]/);
 assert.match(gm,/const characterCatalogs=useMemo\(\(\)=>Object\.fromEntries\(Object\.entries\(rawLive\.characters\)/);
 assert.match(gm,/\[rawLive\.characters\]\)/);
 assert.match(gm,/characterCatalogs\[id\]/);
 assert.match(gm,/\[rawLive\.characters,characterCatalogs,rawLive\.encounter,rawLive\.clock\]/);
});

test('live clock pauses on hidden tabs and catches up immediately on visibility restore',()=>{
 assert.match(live,/const visibilityDocument=typeof document==='undefined'\?null:document/);
 assert.match(live,/const tick=\(\)=>\{if\(!visibilityDocument\?\.hidden\)setClock\(Date\.now\(\)\);\}/);
 assert.match(live,/const resume=\(\)=>\{if\(!visibilityDocument\?\.hidden\)setClock\(Date\.now\(\)\);\}/);
 assert.match(live,/visibilityDocument\?\.addEventListener\('visibilitychange',resume\)/);
 assert.match(live,/visibilityDocument\?\.removeEventListener\('visibilitychange',resume\)/);
 assert.match(live,/window\.clearInterval\(timer\)/);
 assert.match(live,/effectiveSession\(session,clock\)/);
 assert.match(live,/const liveSession=useMemo/);
});

test('header image is loaded once at high priority without reducing original quality',()=>{
 const matches=html.match(/<link rel="preload" as="image" href="assets\/header\/asteria-header-v2\.webp"[^>]*>/g)||[];
 assert.equal(matches.length,1);
 assert.match(matches[0],/fetchpriority="high"/);
 assert.match(html,/<img class="hero-logo" src="asteria-logo-transparent\.png"[^>]*decoding="async"/);
 assert.match(html,/asteria-button-images\.css/);
 assert.match(html,/asteria-dashboard-panel-images\.css/);
 assert.match(html,/asteria-panel-headers\.css/);
 assert.doesNotMatch(html,/asteria-header-v2\.png/);
});
