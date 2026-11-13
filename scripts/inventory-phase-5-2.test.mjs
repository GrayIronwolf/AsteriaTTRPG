import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateMerchantProposal,assertMerchantDealMatches,tradeableMerchantBarterItem} from '../src/state/merchantDealModel.mjs';
import {cleanGMShop} from '../functions/itemStoreCommands.mjs';

const item={id:'base-sword',name:'Iron Sword',definitionId:'base:sword',marketPrice:1,marketValue:.5,qty:3};
const stock={item,qty:4};
const barter={id:'base-ring',name:'Silver Ring',definitionId:'base:ring',qty:2,marketPrice:.4,marketValue:.1};

test('Phase 5.2: bargaining requires valid quantities, copper and stock variants',()=>{
  const terms=validateMerchantProposal({quantity:2,offeredCopper:70},stock);
  assert.equal(terms.quantity,2);
  assert.equal(terms.offeredCopper,70);
  assert.ok(terms.stockVariantKey);
  for(const quantity of [0,1.2,5,1000001])
    assert.throws(()=>validateMerchantProposal({quantity,offeredCopper:30},stock),/whole stock quantity/);
  for(const offeredCopper of [-1,0.5,1000000001])
    assert.throws(()=>validateMerchantProposal({quantity:1,offeredCopper},stock),/whole copper offer/);
  assert.throws(()=>validateMerchantProposal({quantity:1,offeredCopper:0},stock),/Offer some copper/);
});

test('Phase 5.2: optional barter rejects non-tradeable and unidentified inventory',()=>{
  const terms=validateMerchantProposal({quantity:1,offeredCopper:0,barterItemId:barter.id,barterQuantity:1},stock,barter);
  assert.equal(terms.barterItemName,'Silver Ring');
  assert.doesNotThrow(()=>assertMerchantDealMatches({...terms,approvedTotalCopper:0},stock,barter));
  for(const forbidden of [{...barter,bound:true},{...barter,locked:true},{...barter,equipped:true},
    {...barter,questItem:true},{...barter,identified:false}])
    assert.equal(tradeableMerchantBarterItem(forbidden,1),false);
  assert.throws(()=>validateMerchantProposal({quantity:1,offeredCopper:0,barterItemId:barter.id,barterQuantity:3},stock,barter),/valid/);
});

test('Phase 5.2: changed stock or barter variant requires a new proposal',()=>{
  const deal={...validateMerchantProposal({quantity:2,offeredCopper:50,barterItemId:barter.id,barterQuantity:1},stock,barter),approvedTotalCopper:50};
  assert.doesNotThrow(()=>assertMerchantDealMatches(deal,stock,barter));
  assert.throws(()=>assertMerchantDealMatches(deal,{...stock,qty:1},barter),/stock changed/);
  assert.throws(()=>assertMerchantDealMatches(deal,{...stock,item:{...item,material:'Mithril'}},barter),/stock changed/);
  assert.throws(()=>assertMerchantDealMatches(deal,stock,{...barter,qty:0}),/Barter item changed/);
});

test('Phase 5.2: shop merchant roleplay fields are bounded and preserved',()=>{
  const shop=cleanGMShop({personality:'Patient',greeting:'Welcome',specialOffer:'Ask about the ruins'},{id:'smith',stock:[]},'smith');
  assert.equal(shop.personality,'Patient');assert.equal(shop.specialOffer,'Ask about the ruins');
  assert.equal(cleanGMShop({},shop,'smith').greeting,'Welcome');
  assert.equal(cleanGMShop({greeting:'a'.repeat(900)},shop,'smith').greeting.length,500);
});

test('Phase 5.2: only trusted server writes negotiation records and settles shop/character atomically',()=>{
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  const command=readFileSync(new URL('../functions/commands.mjs',import.meta.url),'utf8');
  const handler=readFileSync(new URL('../functions/handler.mjs',import.meta.url),'utf8');
  assert.match(rules,/match \/merchantDeals\/\{dealId\}/);
  assert.match(rules,/allow create, update, delete: if false/);
  for(const method of ['createMerchantDeal','respondMerchantDeal','cancelMerchantDeal'])assert.match(command,new RegExp(method));
  assert.match(command,/assertMerchantDealMatches/);
  assert.match(command,/writeLiveCharacter\(transaction,characterRefs,character\)/);
  assert.match(command,/transaction\.set\(shopRef/);
  assert.match(handler,/respondMerchantDeal/);
});
