import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validateMerchantStanding,merchantStandingTier,merchantRelationshipId,
  merchantStandingFor,merchantCanAccessStock,validateMerchantOpportunity,
  updateMerchantRelationship,merchantOpportunitySummary,MAX_MERCHANT_RELATIONSHIP_HISTORY
} from '../src/state/merchantRelationshipModel.mjs';
import {applyGMShopAction,cleanGMShop} from '../functions/itemStoreCommands.mjs';
import {merchantStockIdentity} from '../src/state/merchantInventoryModel.mjs';
const load=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sword={id:'silver-sword',name:'Silver Sword',marketPrice:1,marketValue:.5};
const initial=()=>({id:'smith',name:'Smith',region:'Palladium',status:'open',currencyCopper:200,
  stock:[{item:sword,qty:3,restockTarget:6,lowStockAt:1}],buyModifier:1,sellModifier:1});
test('Phase 10.3: standing thresholds are bounded and tiers deterministic',()=>{
  assert.equal(validateMerchantStanding(-100),-100);
  assert.equal(validateMerchantStanding(100),100);
  for(const invalid of [-101,101,0.5,Infinity,NaN,'50'])
    assert.throws(()=>validateMerchantStanding(invalid));
  assert.equal(merchantStandingTier(-75),'Hostile');
  assert.equal(merchantStandingTier(-30),'Distrusted');
  assert.equal(merchantStandingTier(0),'Neutral');
  assert.equal(merchantStandingTier(30),'Respected');
  assert.equal(merchantStandingTier(70),'Trusted');
});
test('Phase 10.3: merchant relationship identity and owner selection',()=>{
  assert.equal(merchantRelationshipId('shop-1','char-1'),'shop-1_char-1');
  assert.throws(()=>merchantRelationshipId('shop/1','char-1'));
  const rows=[{shopId:'shop-1',characterId:'char-1',score:65},
    {shopId:'shop-1',characterId:'char-2',score:-90}];
  assert.equal(merchantStandingFor(rows,'shop-1','char-1'),65);
  assert.equal(merchantStandingFor(rows,'shop-1','char-2'),-90);
  assert.equal(merchantStandingFor(rows,'shop-1','unknown'),0);
});
test('Phase 10.3: GM updates do not lose identity, enforce message limits, and cap history',()=>{
  const ids={shopId:'smith',characterId:'a',ownerUid:'alice',operationId:'change'};
  const updated=updateMerchantRelationship({}, {score:50,message:'A valued customer'},ids);
  assert.equal(updated.ownerUid,'alice');
  assert.equal(updated.score,50);
  assert.equal(updated.tier,'Respected');
  assert.equal(updated.history[0].message,'A valued customer');
  const prior={...updated,history:Array.from({length:MAX_MERCHANT_RELATIONSHIP_HISTORY},
    (_,i)=>({id:String(i),score:0}))};
  const revised=updateMerchantRelationship(prior,{score:-45,message:'The merchant feels betrayed'},ids);
  assert.equal(revised.history.length,MAX_MERCHANT_RELATIONSHIP_HISTORY);
  assert.equal(revised.tier,'Distrusted');
  assert.throws(()=>updateMerchantRelationship({}, {score:101,message:''},ids));
  assert.throws(()=>updateMerchantRelationship({}, {score:0,message:'x'.repeat(501)},ids));
});
test('Phase 10.3: special item access requires GM-approved standing, never a price change',()=>{
  assert.deepEqual(validateMerchantOpportunity(45,'Guild stock'),
    {minStanding:45,opportunityLabel:'Guild stock'});
  for(const invalid of [-1,101,5.5])assert.throws(()=>validateMerchantOpportunity(invalid,''));
  const shop=initial();
  const configured=applyGMShopAction(shop,{
    type:'configure-opportunity',stockIndex:0,
    stockIdentity:merchantStockIdentity(sword),minStanding:50,
    opportunityLabel:'Guild Blade'
  },'smith');
  assert.equal(configured.stock[0].minStanding,50);
  assert.equal(configured.stock[0].opportunityLabel,'Guild Blade');
  assert.equal(merchantCanAccessStock(configured.stock[0],49),false);
  assert.equal(merchantCanAccessStock(configured.stock[0],50),true);
  assert.equal(merchantCanAccessStock(configured.stock[0],100),true);
  assert.equal(configured.stock[0].qty,shop.stock[0].qty);
  assert.equal(configured.currencyCopper,shop.currencyCopper);
  assert.equal(cleanGMShop({},configured,'smith').stock[0].minStanding,50);
  assert.deepEqual(merchantOpportunitySummary(configured,49).map(row=>row.unlocked),[false]);
  assert.deepEqual(merchantOpportunitySummary(configured,50).map(row=>row.unlocked),[true]);
  assert.throws(()=>applyGMShopAction(shop,{type:'configure-opportunity',
    stockIndex:0,stockIdentity:'forged',minStanding:80},'smith'));
  assert.throws(()=>applyGMShopAction(shop,{type:'configure-opportunity',
    stockIndex:100,stockIdentity:'forged',minStanding:80},'smith'));
  assert.deepEqual(initial(),shop);
});
test('Phase 10.3: existing unconstrained stock remains accessible',()=>{
  assert.equal(merchantCanAccessStock({qty:2},0),true);
  assert.equal(merchantCanAccessStock({qty:2,minStanding:0},-100),true);
  assert.equal(merchantCanAccessStock({qty:2,minStanding:-50},100),false);
  assert.equal(merchantCanAccessStock({qty:2,minStanding:101},100),false);
});
test('Phase 10.3: relationship writes remain GM only, owner reads scoped and server transactions enforce gates',()=>{
  const handler=load('../functions/handler.mjs');
  const shopServer=load('../functions/itemStoreCommands.mjs');
  const trades=load('../functions/commands.mjs');
  const rules=load('../firestore.rules');
  const frontend=load('../src/dashboards/ShopWorkspace.jsx');
  const gm=load('../src/dashboards/GMWorkspacePanels.jsx');
  const auth=load('../js/firebase-auth.js');
  const adapter=load('../src/firebase/asteriaFirebaseService.js');
  assert.match(handler,/campaignOnlyGMAction=new Set\(\['manageMerchantRelationship'/);
  assert.match(shopServer,/manageMerchantRelationship:async/);
  assert.match(shopServer,/await gm\(tx,campaignId\)/);
  assert.match(shopServer,/isLinkedCharacter\(campaign,characterId,character\.data\(\),campaignId\)/);
  assert.match(rules,/match \/merchantRelationships\/\{relationshipId\}/);
  assert.match(rules,/resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(rules,/allow create, update, delete: if false/);
  assert.match(trades,/requireMerchantStanding\(transaction,campaignId,shopId,characterId,stock\)/);
  assert.match(trades,/requireMerchantStanding\(transaction,campaignId,deal\.shopId,deal\.characterId,stock\)/);
  assert.match(frontend,/Your Standing:/);
  assert.match(frontend,/merchantCanAccessStock/);
  assert.match(gm,/Save Character Standing/);
  assert.match(gm,/Save Special Access/);
  assert.match(auth,/subscribeMerchantRelationships: function/);
  assert.match(adapter,/manageMerchantRelationship:/);
});
