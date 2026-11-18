import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const js=read('js/asteria-aaa-upgrade.js'),css=read('css/asteria-aaa-upgrade.css');
test('all seven approved header menus and categories are present',()=>{
 const groups={
  handbook:['Asteria Players Guide','Asteria GM Guide','Rules','Systems','Quests','Campaigns'],
  world:['Worlds','Realms','Planes','Theology','NPC','Lore','Languages','Factions'],
  compendium:['Races','Classes','Magical & Element','Resources','Blueprints','Recipes','Schematics','Patterns','Formulas','Design'],
  characters:['Forge a Character','My Characters'],
  campaigns:['Forge A Campaign','My Campaigns','Join A Campaign'],
  friends:['My Friends','Chats'],
  account:['Profile','Account Settings','Appearance','Password & Security']
 };
 for(const [id,labels] of Object.entries(groups)){
  const start=js.indexOf("id:'"+id+"', trigger:");
  const end=js.indexOf("    ]}",start);
  assert.ok(start>=0&&end>start,id);
  const block=js.slice(start,end);
  assert.equal((block.match(/^      \['/gm)||[]).length,labels.length,id+' card count');
  for(const label of labels)assert.ok(block.includes("['"+label+"'"),id+' '+label);
 }
 assert.match(js,/entry\[2\]!=='characters'\|\|isLoggedIn\(\)/);
 assert.ok(js.includes("window.AsteriaAccountPages?.open?.('friends')"));
 assert.ok(js.includes("window.AsteriaAccountPages?.openSection?.(a)"));
});
test('menu search, category destinations and UCN path are connected to real controllers',()=>{
 assert.ok(js.includes("aaaMegaSearch"));
 assert.ok(js.includes("window.AsteriaLibrary.open({group:a,category:b,search:c})"));
 assert.ok(js.includes("openCampaignJoinForm"));
 const workspace=read('js/clean-compendium.js');
 assert.ok(workspace.includes('openCampaignJoinForm,'));
 assert.ok(workspace.includes('openCampaignCreateForm,'));
 assert.ok(workspace.includes("byId('workspaceJoinCampaignCode')"));
 assert.ok(js.includes('showFriendSection'));
 assert.ok(js.includes('aaaFriendsChatPanel'));
});
test('exact palette, full-width menu, responsive cards, logo scale, portrait and notifications are styled',()=>{
 assert.ok(css.includes('background:#1E2838!important'));
 assert.ok(css.includes('background:#32373D!important'));
 assert.ok(css.includes('width:calc(100vw - 16px)!important'));
 assert.ok(css.includes('clamp(330px,20.5vw,420px)'));
 assert.ok(css.includes('clamp(180px,10.2vw,220px)'));
 assert.ok(css.includes('flex-wrap:nowrap!important'));
 assert.ok(css.includes('transform:scale(1.065)'));
 assert.ok(css.includes('left:-26px!important'));
 assert.ok(css.includes('var(--aaa-site-active)'));
 assert.ok(read('js/asteria-account-pages.js').includes("open('notifications')"));
});
function browser(hash){
 const handlers={}, classes=()=>{const value=new Set();return {contains:x=>value.has(x),add:(...xs)=>xs.forEach(x=>value.add(x)),remove:(...xs)=>xs.forEach(x=>value.delete(x)),toggle:(x,yes)=>{if(yes)value.add(x);else value.delete(x);}};};
 const home={id:'home',classList:classes()}, forge={id:'workspace',classList:classes()};forge.classList.add('show');
 const location={hash,pathname:'/',search:''};
 const window={location,history:{state:null,replaceState(_s,_t,url){location.hash=url.includes('#')?url.slice(url.indexOf('#')):'';}},scrollTo(){},setTimeout:fn=>fn(),addEventListener:(x,fn)=>handlers['window:'+x]=fn};
 const document={title:'Asteria',readyState:'loading',documentElement:{classList:classes()},body:{classList:classes()},getElementById:id=>id==='home'?home:id==='workspace'?forge:null,querySelectorAll:x=>x.includes('.view')?[home,forge]:[],addEventListener:(x,fn)=>handlers['document:'+x]=fn};
 const context={window,document,setTimeout:fn=>fn(),console};
 vm.runInNewContext(read('js/asteria-home-guard.js'),context);
 handlers['document:DOMContentLoaded']();
 return {window,home,forge,handlers};
}
test('normal restored character route starts on Home, including after Firebase loads',()=>{
 const b=browser('#/react/owned-character/hero');
 assert.equal(b.window.location.hash,'');
 assert.equal(b.home.classList.contains('show'),true);
 assert.equal(b.forge.classList.contains('show'),false);
 b.home.classList.remove('show');b.forge.classList.add('show');
 b.handlers['window:asteria:firebase-ready']();
 assert.equal(b.home.classList.contains('show'),true);
});
test('explicit UCN and secure invitation links survive initial routing',()=>{
 for(const hash of ['#/join/123456789012','#secure-campaign-invite=private-token','#campaign-invite=123456789012']){
  const b=browser(hash);
  assert.equal(b.window.location.hash,hash);
 }
});

test('shared menu and panel surfaces use solid #060D15 without recolouring cards',()=>{
  const skin=read('css/asteria-solid-navy-surfaces.css');
  const html=read('index.html');
  assert.ok(html.includes('css/asteria-solid-navy-surfaces.css'));
  assert.match(skin,/--asteria-menu-panel-surface:\s*#060D15;/);
  for(const selector of ['.topbar.asteria-header','#settingsPanel','.aaa-mega-menu','.compendium-quick-menu','.asteria-account-menu','.asteria-react-panel:not(.card):not(.asteria-royal-relic)']){
    assert.ok(skin.includes(selector),selector);
  }
  assert.match(skin,/background:\s*var\(--asteria-menu-panel-surface\)\s*!important/);
  assert.match(skin,/\.react-dashboard-custom-cell > \.asteria-react-panel\.asteria-royal-relic::after/);
  assert.doesNotMatch(skin,/(?:^|,|\n)\s*(?:body\s+)?\.card\s*\{/m);
  assert.doesNotMatch(skin,/\.aaa-nav-card\s*\{/);
  assert.doesNotMatch(skin,/\.crystal-button\s*\{/);
});
