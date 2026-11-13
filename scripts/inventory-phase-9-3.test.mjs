import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playerExchangePreview,merchantTransactionPreview,safeTradeItem} from '../src/state/tradeExperienceModel.mjs';
const load=file=>readFileSync(new URL(file,import.meta.url),'utf8');
test('Phase 9.3: trade offers show both sides and do not invent an unselected counteroffer',()=>{
  const source={name:'Iron Sword',identified:true,qty:3,type:'Weapon'};
  const offered=playerExchangePreview({mode:'trade',item:source,quantity:2,requestedItem:'Healing potion',
    note:'Would you trade for this blade?'});
  assert.equal(offered.offering.name,'Iron Sword');
  assert.equal(offered.offering.quantity,2);
  assert.equal(offered.receiving,null);
  assert.equal(offered.pending,true);
  assert.equal(offered.requestedTerms,'Healing potion');
  assert.match(offered.warning,/Both characters confirm/);
  const negotiated=playerExchangePreview({mode:'trade',item:source,quantity:2,
    exchangeItem:{name:'Potion',qty:2},exchangeQuantity:1});
  assert.deepEqual(negotiated.receiving,{name:'Potion',quantity:1,identified:true,type:''});
  assert.equal(negotiated.pending,false);
  assert.equal(playerExchangePreview({mode:'trade',item:source,quantity:4}).valid,false);
  assert.equal(playerExchangePreview({mode:'trade',item:source,quantity:1,
    exchangeItem:{name:'Potion',qty:1},exchangeQuantity:3}).valid,false);
});
test('Phase 9.3: hidden identities stay hidden and notes have safe presentation bounds',()=>{
  const secret={name:'Secret Blade',trueName:'Doombringer',identified:false,qty:1,
    rarity:'Legendary',description:'Secret',raw:{image:'gm.png'},effects:['cursed']};
  assert.deepEqual(safeTradeItem(secret),{name:'Unidentified Item',quantity:1,identified:false,type:''});
  const offer=playerExchangePreview({mode:'give',item:secret,quantity:1,note:'x'.repeat(4000)});
  assert.equal(offer.message.length,1000);
  assert.doesNotMatch(JSON.stringify(offer),/Doombringer|Secret Blade|Legendary|gm.png|cursed/);
});
test('Phase 9.3: merchant preview distinguishes listed price, copper offer and optional barter',()=>{
  const item={name:'Sword',qty:10};
  const ordinary=merchantTransactionPreview({kind:'buy',item,quantity:2,unitCopper:100,shop:{name:'Smith'}});
  assert.equal(ordinary.listedCopper,200);
  assert.equal(ordinary.offeredCopper,null);
  assert.equal(ordinary.valid,true);
  const negotiated=merchantTransactionPreview({kind:'buy',item,quantity:2,unitCopper:100,
    offeredCopper:120,barterItem:{name:'Ring',qty:2},barterQuantity:1,
    shop:{name:'Smith',greeting:'Welcome',personality:'Honest',specialOffer:'Rare blades'}});
  assert.equal(negotiated.changeCopper,80);
  assert.equal(negotiated.barter.name,'Ring');
  assert.equal(negotiated.barter.quantity,1);
  assert.equal(negotiated.roleplay,'Welcome');
  assert.equal(negotiated.personality,'Honest');
  assert.equal(negotiated.specialOffer,'Rare blades');
  assert.equal(merchantTransactionPreview({item,quantity:2,unitCopper:-1}).valid,false);
  assert.equal(merchantTransactionPreview({item,quantity:2,unitCopper:2.5}).valid,false);
  assert.equal(merchantTransactionPreview({item,quantity:0,unitCopper:10}).valid,false);
});
test('Phase 9.3: UI uses existing trusted actions, confirmations, and GM-authored dialogue',()=>{
  const player=load('../src/dashboards/PlayerItemExchange.jsx');
  const shops=load('../src/dashboards/ShopWorkspace.jsx');
  const backend=load('../functions/commands.mjs');
  const style=load('../src/styles/asteria-react.css');
  assert.match(player,/Review Your Offer/);
  assert.match(player,/Review Both Sides/);
  assert.match(player,/Both Players Must Confirm/);
  assert.match(player,/playerExchangePreview/);
  assert.match(player,/firebaseService\.finalizeItemTrade/);
  assert.match(player,/firebaseService\.respondItemRequest/);
  assert.match(shops,/Review Bargain Proposal/);
  assert.match(shops,/Merchant transaction preview/);
  assert.match(shops,/merchantTransactionPreview/);
  assert.match(shops,/selected\.greeting/);
  assert.match(shops,/firebaseService\.createMerchantDeal/);
  assert.match(shops,/firebaseService\.buyShopItem/);
  assert.match(shops,/firebaseService\.sellShopItem/);
  assert.match(backend,/requireLiveSession/);
  assert.match(backend,/verifyOwnedLiveCharacter/);
  assert.match(backend,/verifyLiveTradeCounterparty/);
  assert.match(backend,/assertMerchantDealMatches/);
  assert.match(style,/\.react-phase9-trade-sides/);
});
