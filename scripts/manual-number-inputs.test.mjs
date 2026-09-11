import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { isManualNumber, manualNumber } from '../src/state/manualNumber.mjs';

let server, modules = {};
before(async () => {
  globalThis.window = { AsteriaInventory:{catalogEntries:()=>[{id:'potion',name:'Potion'}]}, AsteriaFirebase:{}, setTimeout:()=>{} };
  server = await createServer({configFile:false,server:{middlewareMode:true},plugins:[{
    name:'expose-input-controls-for-tests',
    transform(code,id) {
      if(id.endsWith('/DashboardInformation.jsx')) return code+'\nexport { ResourceControl, CurrencyControl };';
      if(id.endsWith('/GMDashboard.jsx')) return code+'\nexport { EncounterInitiativeInput, EncounterResourceControl, XPDistribution, ACInspectionPanel, PlayerManagementTools };';
      if(id.endsWith('/GMWorkspacePanels.jsx')) return code+'\nexport { ShopManager };';
    }
  }]});
  for(const path of ['components/ManualNumberInput','components/DashboardInformation','dashboards/GMWorkspacePanels','dashboards/GMDashboard','dashboards/PlayerItemExchange']) {
    Object.assign(modules,await server.ssrLoadModule(`/src/${path}.jsx`));
  }
});
after(async()=>{await server?.close();delete globalThis.window;});

// Exercise actual components and handlers with deterministic hook state. These
// tests do not substitute for browser keyboard/device testing.
function mount(Component, props) {
  const slots=[]; let cursor=0, effects=[], tree;
  const depsChanged=(a,b)=>!a||!b||a.length!==b.length||a.some((x,i)=>!Object.is(x,b[i]));
  const dispatcher={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useMemo(fn,deps){const i=cursor++;if(!slots[i]||depsChanged(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||depsChanged(slots[i],deps)){slots[i]=deps;effects.push(fn);}},
    useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value});},
    useCallback(fn,deps){return this.useMemo(()=>fn,deps);}
  };
  const render=()=>{
    cursor=0;effects=[];
    const ref=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
    const previous=ref.current;ref.current=dispatcher;
    try{tree=Component(props);}finally{ref.current=previous;}
    for(const effect of effects)effect();
    return tree;
  };
  render();
  return {render,get tree(){return tree;}};
}
function nodes(tree) {
  if(Array.isArray(tree))return tree.flatMap(nodes);
  if(!React.isValidElement(tree))return [];
  return [tree,...Object.values(tree.props).flatMap(value=>React.isValidElement(value)||Array.isArray(value)?nodes(value):[])];
}
function text(tree){return Array.isArray(tree)?tree.map(text).join(''):React.isValidElement(tree)?text(tree.props.children):tree==null?'':String(tree);}
function field(view,label){const node=nodes(view.tree).find(n=>n.type==='label'&&text(n).startsWith(label));assert.ok(node,`field ${label}`);return nodes(node).find(n=>n.type===modules.ManualNumberInput||n.type==='input'||n.type==='select');}
function input(view,label,value){const node=field(view,label);const rendered=node.type===modules.ManualNumberInput?modules.ManualNumberInput(node.props):node;rendered.props.onChange({target:{value}});view.render();}
function button(view,label){const node=nodes(view.tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(node,`button ${label}`);return node;}
const questProps=(saveSection,quests=[])=>({campaignId:'c',workspace:{quests},characters:{},saveSection});

test('new quest fields start truly blank; 2000 has no leading zero, clears and saves as a number',async()=>{
  const writes=[];const view=mount(modules.QuestWorkspace,questProps(async(section,value)=>{writes.push(value);return {ok:true};}));
  for(const label of ['XP','Currency Amount','Quantity'])assert.equal(field(view,label).props.value,'');
  const html=renderToStaticMarkup(React.createElement(modules.QuestWorkspace,questProps(()=>{})));
  assert.doesNotMatch(html,/type="number"/);assert.match(html,/inputMode="numeric"[^>]*value=""/);
  input(view,'Quest Title','Rescue');input(view,'XP','2000');assert.equal(field(view,'XP').props.value,'2000');
  input(view,'XP','');assert.equal(field(view,'XP').props.value,'');input(view,'XP','250');
  input(view,'Currency Amount','37');input(view,'Currency','silver');
  assert.equal(field(view,'XP').props.value,'250');
  await button(view,'Create Quest').props.onClick();view.render();
  assert.equal(writes[0][0].reward.xp,250);assert.equal(writes[0][0].reward.currency.amount,37);
  assert.equal(field(view,'XP').props.value,'');assert.equal(field(view,'Currency Amount').props.value,'');
});
test('editing a saved quest preserves its actual values, including zero; blank optional rewards save as zero',async()=>{
  const writes=[];const quest={id:'q',title:'Existing',reward:{xp:0,currency:{key:'gold',amount:150}},status:'Draft'};
  const view=mount(modules.QuestWorkspace,questProps(async(section,value)=>{writes.push(value);return {ok:true};},[quest]));
  button(view,'Edit').props.onClick();view.render();
  assert.equal(field(view,'XP').props.value,0);assert.equal(field(view,'Currency Amount').props.value,150);
  input(view,'Currency Amount','');await button(view,'Update Quest').props.onClick();
  assert.equal(writes[0][0].reward.currency.amount,0);
});
test('adding a quest item requires a typed quantity and does not populate untouched XP/currency fields',()=>{
  const view=mount(modules.QuestWorkspace,questProps(()=>{}));
  input(view,'Search Item','Potion');button(view,'Potion').props.onClick();view.render();
  assert.ok(nodes(view.tree).some(n=>/Enter a whole item quantity/.test(n.props.message||'')));
  input(view,'Quantity','3');button(view,'Potion').props.onClick();view.render();
  assert.match(text(view.tree),/Quantity 3/);
  for(const label of ['XP','Currency Amount','Quantity'])assert.equal(field(view,label).props.value,'');
});
test('manual input allows clear, decimals, comma keyboards and negative intermediate drafts without steppers',()=>{
  let value='';const decimal=()=>modules.ManualNumberInput({min:0,step:'0.01',value,onChange:e=>{value=e.target.value;}});
  for(const draft of ['','0','0.','0.25','12,5',''])decimal().props.onChange({target:{value:draft}});
  assert.equal(value,'');decimal().props.onChange({target:{value:'12,5'}});assert.equal(value,'12.5');
  decimal().props.onChange({target:{value:'1e4'}});assert.equal(value,'12.5');
  const signed=()=>modules.ManualNumberInput({value,onChange:e=>{value=e.target.value;}});
  signed().props.onChange({target:{value:'-'}});assert.equal(value,'-');
  signed().props.onChange({target:{value:'-5'}});assert.equal(value,'-5');
  assert.equal(signed().props.type,'text');assert.equal(signed().props.onWheel,undefined);
});
test('blank or invalid required numbers are rejected, optional blank is explicit zero and ranges are retained',()=>{
  for(const value of ['',null,undefined,'-','.','NaN','Infinity','1.5',Number.MAX_SAFE_INTEGER+1])assert.equal(isManualNumber(value,{min:1}),false,String(value));
  assert.equal(isManualNumber('',{optional:true}),true);assert.equal(manualNumber(''),0);
  assert.equal(isManualNumber('21',{min:1,max:20}),false);assert.equal(isManualNumber('20',{min:1,max:20}),true);
  assert.equal(isManualNumber('-3'),true);assert.equal(isManualNumber('0.25',{min:0,integer:false}),true);
});
test('HP adjustments cannot apply an implicit 1; clearing then entering 20 applies exactly 20',async()=>{
  const writes=[];const view=mount(modules.ResourceControl,{label:'HP',resource:'hp',value:[50,100],editable:true,onResourceChange:async(...args)=>writes.push(args)});
  let amount=nodes(view.tree).find(n=>n.type===modules.ManualNumberInput);
  assert.equal(amount.props.value,'');assert.equal(button(view,'+').props.disabled,true);
  await button(view,'+').props.onClick();assert.equal(writes.length,0);
  amount.props.onChange({target:{value:'20'}});view.render();assert.equal(button(view,'+').props.disabled,false);
  await button(view,'+').props.onClick();assert.deepEqual(writes,[['hp',20]]);
  view.render();nodes(view.tree).find(n=>n.type===modules.ManualNumberInput).props.onChange({target:{value:''}});view.render();
  await button(view,'-').props.onClick();assert.equal(writes.length,1);
});
test('saved initiative stays visible; clearing does not write zero, negative initiative commits correctly',()=>{
  const writes=[];const view=mount(modules.EncounterInitiativeInput,{entry:{id:'e',name:'Enemy',initiative:12},onCommit:value=>writes.push(value)});
  assert.equal(view.tree.props.value,'12');view.tree.props.onChange({target:{value:''}});view.render();assert.equal(view.tree.props.value,'');
  view.tree.props.onBlur();view.render();assert.equal(view.tree.props.value,'12');assert.equal(writes.length,0);
  view.tree.props.onChange({target:{value:'-2'}});view.render();view.tree.props.onBlur();assert.deepEqual(writes,[-2]);
});
test('player item transfer requires an explicit quantity and sends a numeric amount',async()=>{
  const writes=[];window.AsteriaFirebase.createLiveItemRequest=async(...args)=>{writes.push(args);return {ok:true};};
  const view=mount(modules.SendPlayerItemModal,{campaignId:'c',character:{id:'a'},target:{id:'b',name:'B'},item:{id:'i',name:'Potion',qty:5},editable:true,onClose:()=>{}});
  assert.equal(field(view,'Quantity').props.value,'');await button(view,'Send Item').props.onClick();assert.equal(writes.length,0);
  input(view,'Quantity','6');await button(view,'Send Item').props.onClick();assert.equal(writes.length,0);
  input(view,'Quantity','2');await button(view,'Send Item').props.onClick();assert.equal(writes[0][5].quantity,2);
});
test('new shop modifiers are blank, decimal typing survives, and saved modifiers are numeric',async()=>{
  const writes=[];window.AsteriaFirebase.manageCampaignShop=async(...args)=>{writes.push(args);return {ok:true};};
  const view=mount(modules.ShopManager,{campaignId:'c',characters:{},itemEcosystem:{}});
  for(const label of ['Buy Modifier','Sell Modifier'])assert.equal(field(view,label).props.value,'');
  input(view,'Name','Shop');await button(view,'Create Shop').props.onClick();assert.equal(writes.length,0);
  input(view,'Buy Modifier','0.');assert.equal(field(view,'Buy Modifier').props.value,'0.');input(view,'Buy Modifier','0.25');input(view,'Sell Modifier','1.5');
  await button(view,'Create Shop').props.onClick();assert.equal(writes[0][1].shop.buyModifier,0.25);assert.equal(writes[0][1].shop.sellModifier,1.5);
});
test('campaign player limit keeps saved value and rejects blank before any write',async()=>{
  const writes=[];window.AsteriaFirebase.updateCampaignDetails=async(...args)=>{writes.push(args);return {ok:true};};
  const view=mount(modules.CampaignManagerWorkspace,{campaignId:'c',campaign:{name:'Campaign',playerLimit:6},workspace:{},characters:{},saveSection:async()=>({ok:true})});
  assert.equal(field(view,'Player Limit').props.value,6);input(view,'Player Limit','');await button(view,'Save Campaign Settings').props.onClick();assert.equal(writes.length,0);
  input(view,'Player Limit','12');await button(view,'Save Campaign Settings').props.onClick();assert.equal(writes[0][1].playerLimit,12);
});
