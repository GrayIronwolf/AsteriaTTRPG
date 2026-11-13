import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  normalizeMerchantRoute,merchantRouteCanDepart,merchantTravelState,
  moveMerchantOnRoute,merchantRegionOptions,merchantsInRegion,merchantShopAvailable,
  MAX_MERCHANT_TRAVEL_HISTORY
} from '../src/state/merchantTravelModel.mjs';
import {applyGMShopAction,cleanGMShop} from '../functions/itemStoreCommands.mjs';

const route={id:'trade-1',name:'Coastal Road',from:'Palladium',to:'Vaelgard',status:'Open'};
const shop=()=>({id:'shop-1',name:'Wandering Merchant',status:'open',region:'Palladium',
  buyModifier:1,sellModifier:1,currencyCopper:3000,
  stock:[{qty:5,item:{id:'sword',name:'Iron Sword',marketPrice:1,marketValue:.5}}],
  visitorCharacterIds:['a'],restockHistory:[{id:'old',lines:1,units:2}]});
const act=(current,type,extra={})=>applyGMShopAction(current,{type,route,operationId:type,...extra},'shop-1');

test('Phase 10.2: route validation requires distinct bounded regions and supported statuses',()=>{
  assert.deepEqual(normalizeMerchantRoute(route),route);
  assert.equal(merchantRouteCanDepart(route),true);
  assert.equal(merchantRouteCanDepart({...route,status:'Unstable'}),true);
  for(const status of ['Closed','Blockaded'])assert.equal(merchantRouteCanDepart({...route,status}),false);
  for(const candidate of [{...route,id:'bad/id'},{...route,to:'palladium'},
    {...route,from:''},{...route,status:'Teleporting'}])
    assert.throws(()=>normalizeMerchantRoute(candidate));
});
test('Phase 10.2: travel lifecycle is explicit, preserves inventory and currency, and closes merchant in transit',()=>{
  const original=shop();
  const assigned=act(original,'assign-route',{startRegion:'Palladium'});
  assert.equal(assigned.travel.status,'at-stop');
  assert.equal(assigned.travel.routeId,'trade-1');
  assert.equal(assigned.region,'Palladium');
  assert.equal(merchantShopAvailable(assigned,'a'),true);
  const departing=act(assigned,'depart-route');
  assert.equal(departing.travel.status,'travelling');
  assert.equal(departing.travel.destinationRegion,'Vaelgard');
  assert.equal(departing.status,'closed');
  assert.equal(merchantShopAvailable(departing,'a'),false);
  assert.throws(()=>act(departing,'depart-route'),/Assign a route/);
  assert.throws(()=>act(departing,'unassign-route'),/Arrive/);
  assert.throws(()=>act(departing,'save',{shop:{status:'open'}}),/travelling/);
  const arrived=act(departing,'arrive-route');
  assert.equal(arrived.region,'Vaelgard');
  assert.equal(arrived.status,'open');
  assert.equal(arrived.travel.status,'at-stop');
  assert.equal(merchantShopAvailable(arrived,'a'),true);
  assert.deepEqual(arrived.stock,original.stock);
  assert.equal(arrived.currencyCopper,original.currencyCopper);
  assert.deepEqual(arrived.restockHistory,original.restockHistory);
  const returnTrip=act(arrived,'depart-route');
  assert.equal(returnTrip.travel.destinationRegion,'Palladium');
  const returned=act(returnTrip,'arrive-route');
  assert.equal(returned.region,'Palladium');
  assert.equal(returned.travelHistory.length,5);
  const stationary=act(returned,'unassign-route');
  assert.equal(stationary.travel,null);
  assert.equal(merchantTravelState(stationary),'stationary');
  assert.equal(original.travel,undefined);
});
test('Phase 10.2: closed and blockaded routes cannot initiate travel',()=>{
  const assigned=act(shop(),'assign-route',{startRegion:'Vaelgard'});
  for(const status of ['Closed','Blockaded']){
    assert.throws(()=>act(assigned,'depart-route',{route:{...route,status}}),/closed or blockaded/);
  }
  assert.throws(()=>act(shop(),'assign-route',{startRegion:'Elsewhere'}),/starting region/);
  assert.throws(()=>act(assigned,'depart-route',{route:{...route,to:'Changed'}}),/route changed/);
  assert.throws(()=>act(shop(),'arrive-route'),/not travelling/);
});
test('Phase 10.2: closed shops stay closed after completing travel and history is bounded',()=>{
  const closed={...shop(),status:'closed'};
  const assigned=act(closed,'assign-route',{startRegion:'Palladium'});
  const departed=act(assigned,'depart-route');
  const arrived=act(departed,'arrive-route');
  assert.equal(arrived.status,'closed');
  assert.equal(merchantShopAvailable(arrived,'a'),false);
  const veryOld={...closed,travelHistory:Array.from({length:MAX_MERCHANT_TRAVEL_HISTORY},(_,i)=>({id:String(i)}))};
  const next=act(veryOld,'assign-route',{startRegion:'Palladium'});
  assert.equal(next.travelHistory.length,MAX_MERCHANT_TRAVEL_HISTORY);
  assert.equal(next.travelHistory[0].event,'assigned');
});
test('Phase 10.2: regional market projection retains all available shops and does not grant visiting access',()=>{
  const shops=[shop(),{...shop(),id:'shop-2',region:'Vaelgard'},
    {...shop(),id:'shop-3',region:'palladium',status:'closed'},
    {...shop(),id:'shop-4',region:'Palladium',status:'deleted',deleted:true}];
  assert.deepEqual(merchantRegionOptions(shops),['Palladium','Vaelgard']);
  assert.deepEqual(merchantsInRegion(shops,'Palladium').map(x=>x.id),['shop-1','shop-3']);
  assert.equal(merchantsInRegion(shops,'VAELGARD').length,1);
  assert.equal(merchantShopAvailable(shop(),'b'),false);
  assert.equal(merchantShopAvailable(shop(),'a'),true);
});
test('Phase 10.2: shop normalization persists route state while existing pricing and stock stay untouched',()=>{
  const travelling=act(act(shop(),'assign-route',{startRegion:'Palladium'}),'depart-route');
  const saved=cleanGMShop({description:'New note'},travelling,'shop-1');
  assert.deepEqual(saved.travel,travelling.travel);
  assert.deepEqual(saved.stock,shop().stock);
  assert.equal(saved.currencyCopper,3000);
});
test('Phase 10.2: trusted GM shop command, region UI and unchanged commerce paths are wired',()=>{
  const server=readFileSync(new URL('../functions/itemStoreCommands.mjs',import.meta.url),'utf8');
  const commands=readFileSync(new URL('../functions/commands.mjs',import.meta.url),'utf8');
  const gm=readFileSync(new URL('../src/dashboards/GMWorkspacePanels.jsx',import.meta.url),'utf8');
  const player=readFileSync(new URL('../src/dashboards/ShopWorkspace.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/asteria-react.css',import.meta.url),'utf8');
  assert.match(server,/await gm\(tx,campaignId\)/);
  assert.match(server,/workspaceRef=doc\(db,'campaigns',campaignId,'systems','gmWorkspace'\)/);
  assert.match(server,/normalizeMerchantRoute\(match\)/);
  assert.match(server,/moveMerchantOnRoute\(shop,action,action\.route\)/);
  assert.match(commands,/buyLiveShopItem:/);
  assert.match(commands,/sellLiveShopItem:/);
  assert.match(commands,/respondMerchantDeal:/);
  assert.match(gm,/Assign Merchant to Route/);
  assert.match(gm,/Depart for Next Region/);
  assert.match(gm,/Confirm Arrival/);
  assert.match(player,/All Regions/);
  assert.match(player,/merchantShopAvailable/);
  assert.match(css,/\.react-merchant-route-controls/);
});
