import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import '../js/character-access.js';

let server, CharacterDashboard;
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
    }
  }]});
  ({CharacterDashboard} = await server.ssrLoadModule('/src/dashboards/CharacterDashboard.jsx'));
});
after(async()=>{await server?.close();delete globalThis.window;});
const render = ()=>renderToStaticMarkup(React.createElement(CharacterDashboard,{campaignId:'c',characterId:'b'}));
test('GM dashboard render includes return button only for validated GM entry and disables resource edits',()=>{
  window.history.state={gmReturn:{uid:'gm',campaignId:'c',characterId:'b',tab:'tools',selectedId:'b'}};
  const html=render();
  assert.match(html,/← Back to GM Dashboard/);
  assert.match(html,/Player B/);
  assert.match(html,/<button aria-label="Add 1 HP" disabled=""/);
  window.history.state=null;
  assert.doesNotMatch(render(),/Back to GM Dashboard/);
});
test('normal owner render never inherits a GM return button from another account',()=>{
  window.AsteriaFirebase.getUser=()=>({uid:'player'});
  window.history.state={gmReturn:{uid:'gm',campaignId:'c',characterId:'b'}};
  const html=render();
  assert.match(html,/Player B/);
  assert.doesNotMatch(html,/Back to GM Dashboard/);
  assert.match(html,/<button aria-label="Add 1 HP" type="button"/);
});
