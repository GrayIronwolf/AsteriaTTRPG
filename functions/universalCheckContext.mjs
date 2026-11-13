// Phase 2: trusted, immutable origin descriptors for reusable campaign checks.
// Source labels are reconstructed on the server; client-provided names cannot
// impersonate an NPC, merchant or a bargaining offer.
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value)&&
  !['__proto__','prototype','constructor'].includes(value);
const name=(value,max=160)=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
function assert(test,message){if(!test)throw Error(message);}
function checkInput(input){
  assert(input&&typeof input==='object'&&!Array.isArray(input),'Check source must be an object.');
  assert(['npc','merchant','merchant-deal','gameplay'].includes(input.kind),'Unknown check source.');
  return input.kind;
}
export async function resolveUniversalCheckContext(transaction,db,campaignId,input,characterIds,checkType,now=Date.now()){
  if(input===undefined||input===null)return null; // existing Phase 1 requests remain supported
  const kind=checkInput(input);
  if(kind==='gameplay'){
    const label=name(input.label,120);
    assert(label.length>=3&&typeof input.label==='string'&&input.label.trim().length<=120,
      'Enter a gameplay scene label (3–120 characters).');
    return {kind,label};
  }
  if(kind==='npc'){
    assert(validId(input.npcId),'Choose an existing campaign NPC.');
    const snapshot=await transaction.get(db.doc('campaigns/'+campaignId+'/systems/gmWorkspace'));
    const world=snapshot.exists?snapshot.data()?.world||{}:{};
    const npc=(Array.isArray(world.npcs)?world.npcs:[]).find(row=>row&&row.id===input.npcId);
    assert(npc,'NPC is no longer in this campaign.');
    assert(name(npc.name).length>0,'NPC needs a name.');
    return {kind,npcId:npc.id,label:name(npc.name)};
  }
  assert(validId(input.shopId),'Choose an existing merchant.');
  const shopSnap=await transaction.get(db.doc('campaigns/'+campaignId+'/shops/'+input.shopId));
  let shop=shopSnap.exists?shopSnap.data():null;
  if(!shop){
    // An existing campaign can still have shops in the pre-migration list.
    const ecosystem=await transaction.get(db.doc('campaigns/'+campaignId+'/systems/itemEcosystem'));
    shop=(ecosystem.exists?(ecosystem.data()?.shops||[]):[]).find(row=>row?.id===input.shopId);
  }
  assert(shop&&!shop.deleted&&shop.status!=='deleted','Merchant no longer exists.');
  const shopName=name(shop.name)||'Merchant';
  const source={kind,shopId:input.shopId,label:shopName};
  if(validId(shop.npcId))source.npcId=shop.npcId;
  if(kind==='merchant')return source;
  assert(validId(input.dealId),'Choose a pending merchant offer.');
  assert(checkType==='social','Merchant bargaining uses a social skill check.');
  assert(characterIds.length===1,'A bargain has exactly one player character.');
  const snap=await transaction.get(db.doc('campaigns/'+campaignId+'/merchantDeals/'+input.dealId));
  const deal=snap.exists?snap.data():null;
  assert(deal&&deal.shopId===input.shopId,'The offer does not belong to this merchant.');
  assert(deal.status==='pending','The merchant offer is no longer pending.');
  assert(typeof deal.expiresAt==='number'&&now<=deal.expiresAt,
    'The merchant offer expired. Ask the player to make a new offer.');
  assert(deal.characterId===characterIds[0],'The selected character does not own this offer.');
  return {...source,dealId:input.dealId,
    label:shopName,
    detail:'Bargaining: '+Math.max(1,Number(deal.quantity)||1)+' × '+(name(deal.stockItemName,100)||'item'),
    offerCopper:Number(deal.offeredCopper)||0,listedCopper:Number(deal.listedTotalCopper)||0};
}
