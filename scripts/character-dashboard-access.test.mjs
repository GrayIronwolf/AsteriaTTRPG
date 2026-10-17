import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';
import '../js/character-access.js';

let server, CharacterDashboard, OwnedCharacterDashboard, DashboardErrorBoundary, CombatDashboardLayout, CombatActionButton;
const campaign = {id:'c', ownerUid:'gm', name:'Campaign', playerCharacterLinks:{b:'player'}};
const character = {id:'b',ownerUid:'player',sharedCampaignId:'c',name:'Player B',hp:[8,10],sp:[8,10],mp:[8,10],inventory:[],storages:[]};
before(async()=>{
  globalThis.window = { AsteriaCharacterAccess:globalThis.AsteriaCharacterAccess, history:{state:null},
    AsteriaFirebase:{getUser:()=>({uid:'gm'})},
    __ownershipTestLive:{campaign,character,characters:{b:character},session:{status:'active',editable:true},events:[],presence:{},partyWorkspace:{},partyChat:[],itemEcosystem:{},online:true,connectionState:'connected',loading:false,error:''}
  };
  server = await createServer({configFile:false,server:{middlewareMode:true},plugins:[{
    name:'ownership-test-live-data',
    transform(code,id){
      if(id.endsWith('/src/sessions/useCampaignLiveData.js')) return 'export function useCampaignLiveData(){return window.__ownershipTestLive;}';
      if(id.endsWith('/src/sessions/useOwnedCharacterData.js')) return 'export function useOwnedCharacterData(){return window.__ownershipTestLive;}';
    }
  }]});
  ({CharacterDashboard,OwnedCharacterDashboard} = await server.ssrLoadModule('/src/dashboards/CharacterDashboard.jsx'));
  ({DashboardErrorBoundary} = await server.ssrLoadModule('/src/app/AsteriaReactRoot.jsx'));
  ({CombatDashboardLayout,CombatActionButton} = await server.ssrLoadModule('/src/dashboards/CombatPanel.jsx'));
});
after(async()=>{await server?.close();delete globalThis.window;});
const render = ()=>renderToStaticMarkup(React.createElement(CharacterDashboard,{campaignId:'c',characterId:'b'}));
test('GM dashboard render includes return button only for validated GM entry and disables resource edits',()=>{
  window.history.state={gmReturn:{uid:'gm',campaignId:'c',characterId:'b',tab:'tools',selectedId:'b'}};
  const html=render();
  assert.match(html,/← Back to GM Dashboard/);
  assert.match(html,/Player B/);
  assert.match(html,/<input aria-label="HP change amount" disabled=""/);
  assert.match(html,/<button aria-label="Add amount to HP" disabled=""/);
  window.history.state=null;
  assert.doesNotMatch(render(),/Back to GM Dashboard/);
});
test('normal owner render never inherits a GM return button from another account',()=>{
  window.AsteriaFirebase.getUser=()=>({uid:'player'});
  window.history.state={gmReturn:{uid:'gm',campaignId:'c',characterId:'b'}};
  const html=render();
  assert.match(html,/Player B/);
  assert.doesNotMatch(html,/Back to GM Dashboard/);
  assert.match(html,/<input aria-label="HP change amount" type="text"/);
  // Owner may enter an amount; applying a blank amount is deliberately disabled.
  assert.match(html,/<button aria-label="Add amount to HP" disabled=""/);
});
test('unassigned owner can inspect the same dashboard without enabling gameplay or campaign controls',()=>{
  window.AsteriaFirebase.getUser=()=>({uid:'player'});
  window.__ownershipTestLive={...window.__ownershipTestLive,campaign:null,character:{...character,id:'ty',name:'Ty',sharedCampaignId:'',klass:'Artificer / Bloodhunter'},session:{status:'idle',editable:false}};
  const html=renderToStaticMarkup(React.createElement(OwnedCharacterDashboard,{characterId:'ty'}));
  assert.match(html,/Ty/);assert.match(html,/Unassigned character/);assert.match(html,/Link a campaign/);
  assert.match(html,/<input aria-label="HP change amount" disabled=""/);
  assert.doesNotMatch(html,/Back to GM Dashboard/);
  assert.doesNotMatch(html,/id="character-dashboard-menu-tab-party"/);
});
test('an unassigned sheet cannot render for a different signed-in owner',()=>{
  window.AsteriaFirebase.getUser=()=>({uid:'someone-else'});
  const html=renderToStaticMarkup(React.createElement(OwnedCharacterDashboard,{characterId:'ty'}));
  assert.match(html,/Only the owner/);assert.doesNotMatch(html,/Artificer/);
});

test('combat sidebar is absent in setup and for nonparticipants, restores on refresh, and keeps resources in the canonical HUD',()=>{
  const previous=window.__ownershipTestLive;
  window.__ownershipTestLive={...previous,campaign,character,characters:{b:character},session:{status:'active',editable:true},encounter:{status:'ready',combatants:[{id:'player-b',characterId:'b',initiative:17}],combat:{version:1,participants:{'player-b':{ap:3,bonus:true,turns:1}}}}};
  try {
    const ready=render();assert.doesNotMatch(ready,/<aside/);assert.doesNotMatch(ready,/class="combat-panel/);
    assert.ok(ready.indexOf('react-campaign-resource-hud')<ready.indexOf('Character Dashboard menu'));
    assert.ok(ready.indexOf('Character Dashboard menu')<ready.indexOf('react-player-overview-grid'));
    window.__ownershipTestLive.encounter.status='active';
    const active=render();assert.match(active,/<aside[^>]+aria-label="Combat controls"/);assert.match(active,/is-combat-mode/);assert.match(active,/END TURN/);
    assert.equal((active.match(/aria-label="HP change amount"/g)||[]).length,1);assert.doesNotMatch(active,/class="combat-resources"/);
    assert.ok(active.indexOf('Character Dashboard menu')<active.indexOf('combat-mode-layout'));
    assert.ok(active.indexOf('combat-mode-layout')<active.indexOf('combat-dashboard-main'));
    assert.ok(active.indexOf('react-campaign-resource-hud')<active.indexOf('Character Dashboard menu'));
    assert.ok(active.indexOf('Character Dashboard menu')<active.indexOf('react-player-overview-grid'));
    window.__ownershipTestLive.encounter.combatants=[{id:'other',characterId:'other'}];assert.doesNotMatch(render(),/<aside/);
    window.__ownershipTestLive.encounter.status='ended';assert.doesNotMatch(render(),/<aside/);
  } finally {window.__ownershipTestLive=previous;}
});

test('mobile uses the same combat content, closes for a selector, and unmounts the exiting sidebar without remounting dashboard content',async()=>{
  const previous={setTimeout:window.setTimeout,clearTimeout:window.clearTimeout,matchMedia:window.matchMedia,addEventListener:window.addEventListener,removeEventListener:window.removeEventListener};
  Object.assign(window,{setTimeout,clearTimeout,matchMedia:()=>({matches:true,addEventListener(){},removeEventListener(){}}),addEventListener(){},removeEventListener(){}});
  let renderer,mounts=0,selector='';
  function Content(){React.useEffect(()=>{mounts++;},[]);return React.createElement('p',null,'Resource panel and dashboard');}
  const combat={active:false,actorId:'player-b',character,encounter:{status:'active',turnIndex:0,combatants:[{id:'player-b',characterId:'b',initiative:17}],combat:{version:1,participants:{'player-b':{ap:3,bonus:true,turns:1}}}},options:[],selector:'',selected:null,setSelector:value=>{selector=value;},setSelected(){},select(){},command:async()=>({ok:true}),busy:false,message:'',editable:true};
  const node=value=>React.createElement(CombatDashboardLayout,{combat:value},React.createElement(Content));
  try {
    await act(async()=>{renderer=TestRenderer.create(node(combat));});assert.equal(renderer.root.findAllByType('aside').length,0);
    await act(async()=>{renderer.update(node({...combat,active:true}));});assert.equal(renderer.root.findAllByType('aside').length,1);assert.equal(mounts,1);
    const tab=renderer.root.findByProps({className:'combat-mobile-tab'});act(()=>tab.props.onClick());assert.equal(renderer.root.findAllByProps({role:'dialog'}).length,1);
    const spell=renderer.root.findAllByType('button').find(button=>button.children.join('')==='SPELL');act(()=>spell.props.onClick());assert.equal(selector,'spell');assert.equal(renderer.root.findAllByProps({role:'dialog'}).length,0);
    await act(async()=>{renderer.update(node({...combat,active:true,selected:{id:'basic:dash',name:'Dash',kind:'basic',key:'dash',ap:2,costs:{}}}));});assert.equal(renderer.root.findAllByProps({role:'dialog'}).length,1);assert.equal(renderer.root.findAllByProps({className:'combat-preview'}).length,1);
    await act(async()=>{renderer.update(node(combat));});assert.equal(renderer.root.findByType('aside').props['aria-hidden'],true);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,330));});assert.equal(renderer.root.findAllByType('aside').length,0);assert.equal(mounts,1);
  } finally {act(()=>renderer?.unmount());Object.assign(window,previous);}
});

test('a rejected dashboard import shows recovery controls and does not block another route',async t=>{
  t.mock.method(console,'error',()=>{});
  let rejectImport, reloads=0, renderer;
  window.location={reload:()=>reloads++};
  const Dashboard=React.lazy(()=>new Promise((_resolve,reject)=>{rejectImport=reject;}));
  try {
    await act(async()=>{
      renderer=TestRenderer.create(React.createElement(DashboardErrorBoundary,{key:'character/a'},
        React.createElement(React.Suspense,{fallback:'Loading dashboard'},React.createElement(Dashboard))));
    });
    assert.equal(renderer.toJSON(),'Loading dashboard');
    await act(async()=>{rejectImport(new Error('Unable to preload CSS for /asteria-react2.css'));});
    assert.match(renderer.root.findByProps({role:'alert'}).findByType('p').children.join(''),/dashboard could not load/);
    const reload=renderer.root.findByType('button');
    assert.equal(reload.children.join(''),'Reload dashboard');
    act(()=>reload.props.onClick());
    assert.equal(reloads,1);
    act(()=>renderer.update(React.createElement(DashboardErrorBoundary,{key:'gm/c'},React.createElement('p',null,'GM dashboard'))));
    assert.equal(renderer.root.findByType('p').children.join(''),'GM dashboard');
    assert.equal(renderer.root.findAllByProps({role:'alert'}).length,0);
  } finally {
    act(()=>renderer?.unmount());
    delete window.location;
  }
});


test('action card double-click spends once without opening preview; keyboard opens explicit spend controls',async()=>{
  const previous={setTimeout:window.setTimeout,clearTimeout:window.clearTimeout};
  const timers=new Map();let next=0,selected=0,spent=0;
  window.setTimeout=fn=>{timers.set(++next,fn);return next;};window.clearTimeout=id=>timers.delete(id);
  const option={id:'basic:walk',key:'walk',kind:'basic',name:'Walk',ap:1,costs:{}};
  const combat={actorId:'player-b',character,encounter:{status:'active',turnIndex:0,combatants:[{id:'player-b'}],combat:{participants:{'player-b':{ap:3,bonus:true}}}},editable:true,busy:false,select(){selected++;},spend(){spent++;}};
  let renderer;
  try{
    act(()=>{renderer=TestRenderer.create(React.createElement(CombatActionButton,{combat,option},'Walk'));});
    const button=renderer.root.findByType('button');
    act(()=>button.props.onClick({detail:1}));assert.equal(selected,0);assert.equal(spent,0);
    act(()=>button.props.onClick({detail:2}));act(()=>button.props.onDoubleClick());
    assert.equal(spent,1);assert.equal(selected,0);assert.equal(timers.size,0);
    act(()=>button.props.onClick({detail:0}));assert.equal(selected,1);assert.equal(spent,1);
    act(()=>button.props.onClick({detail:1}));for(const fn of timers.values())act(()=>fn());assert.equal(selected,2);assert.equal(spent,1);
  }finally{act(()=>renderer?.unmount());Object.assign(window,previous);}
});
