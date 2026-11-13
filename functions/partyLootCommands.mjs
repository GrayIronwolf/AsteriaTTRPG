import {isLinkedCharacter} from './characterPermissions.mjs';
import {validateGMRewardPayload} from '../src/state/gmRewardModel.mjs';
import {
  PARTY_STASH_MAX_ITEMS,PARTY_LOOT_MAX_COPPER,validatePartyStash,validatePartyLootDrop,
  splitPartyCopper,validatePartyContainerSize,safePartyStashEntry
} from '../src/state/partyLootModel.mjs';

const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);
const exists=snapshot=>typeof snapshot?.exists==='function'?snapshot.exists():Boolean(snapshot?.exists);
const copy=value=>JSON.parse(JSON.stringify(value));
const quantity=value=>{
  if(!Number.isSafeInteger(value)||value<1||value>1000000)
    throw Error('Choose a whole quantity from 1 to 1,000,000.');
  return value;
};

// All inventory movements take place inside the same existing authenticated
// action receipt transaction as the player character, private owner mirror,
// and the party container. Clients have read-only access to these documents.
export function createPartyLootCommands(context,helpers){
  const {db,currentUser,requestId,doc,runTransaction,serverTimestamp}=context;
  const {
    requireLiveSession,requireCampaignGM,liveCharacterRefs,
    verifyOwnedLiveCharacter,verifyLiveTradeCounterparty,writeLiveCharacter,
    characterInventory,liveItemId,placeCharacterItem,appendActivity,
    currencyTotal,setCurrencyTotal
  }=helpers;
  const stashRef=(campaignId,stashId)=>doc(db,'campaigns',campaignId,'partyStashes',stashId);
  const lootRef=(campaignId,lootId)=>doc(db,'campaigns',campaignId,'partyLoot',lootId);
  const draftRef=(campaignId,lootId)=>doc(db,'campaigns',campaignId,'partyLootDrafts',lootId);
  const requireId=(value,label)=>{
    if(!id(value))throw Error('Choose a valid '+label+'.');
    return value;
  };
  const checkLinked=async(tx,campaignId,characterId,character)=>{
    const campaign=await tx.get(doc(db,'campaigns',campaignId));
    if(!exists(campaign)||!isLinkedCharacter(campaign.data(),characterId,character,campaignId))
      throw Error('This character is not linked to the campaign.');
  };
  const checkCombat=(refs,characterId)=>{
    const encounter=refs.encounter||{};
    if(encounter.status==='active'&&(encounter.combatants||[]).some(row=>String(row.characterId)===String(characterId)))
      throw Error('Finish the active encounter before moving shared equipment.');
  };
  const result=async work=>{
    try{return {ok:true,...await runTransaction(db,work)};}
    catch(error){return {ok:false,error:error?.message||String(error)};}
  };
  return {
    managePartyStash:async(campaignId,_scope,action={})=>result(async tx=>{
      await requireCampaignGM(tx,campaignId);
      const type=String(action.type||'');
      if(!['create','update','add-item','delete'].includes(type))throw Error('Choose a valid party stash action.');
      const stashId=requireId(String(action.stashId||action.stash?.id||(type==='create'?'stash-'+requestId:'')),'party stash');
      const ref=stashRef(campaignId,stashId),snapshot=await tx.get(ref);
      const previous=exists(snapshot)?snapshot.data():null;
      if(type==='create'&&previous)throw Error('A stash with that identifier already exists.');
      if(type!=='create'&&!previous)throw Error('This shared stash no longer exists.');
      if(type==='delete'){
        if(previous.items?.length)throw Error('Remove or claim all items before deleting this stash.');
        tx.delete(ref);
        return {stashId,deleted:true};
      }
      let stash=type==='create'||type==='update'
        ?validatePartyStash(action.stash||{},previous||{},stashId)
        :validatePartyStash({},previous,stashId);
      if(type==='add-item'){
        const entry=safePartyStashEntry(action.item,'stash-item-'+requestId,quantity(action.quantity));
        if(stash.items.some(row=>row.id===entry.id))throw Error('This stash item was already added.');
        if(stash.items.length>=PARTY_STASH_MAX_ITEMS)throw Error('This chest or stash is full.');
        stash.items.push(entry);
      }
      validatePartyContainerSize(stash);
      tx.set(ref,{...stash,createdAt:previous?.createdAt||serverTimestamp(),
        updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
      return {stashId,stash};
    }),

    managePartyLootDrop:async(campaignId,_scope,action={})=>result(async tx=>{
      await requireCampaignGM(tx,campaignId);
      const type=String(action.type||'');
      if(!['create','reveal','cancel'].includes(type))throw Error('Choose a valid loot drop action.');
      const lootId=requireId(String(action.lootId||(type==='create'?'party-loot-'+requestId:'')),'loot drop');
      const publicRef=lootRef(campaignId,lootId),privateRef=draftRef(campaignId,lootId);
      const [publicSnapshot,privateSnapshot]=await Promise.all([tx.get(publicRef),tx.get(privateRef)]);
      const visible=exists(publicSnapshot)?publicSnapshot.data():null;
      const hidden=exists(privateSnapshot)?privateSnapshot.data():null;
      if(type==='create'){
        if(visible||hidden)throw Error('This loot drop already exists.');
        const drop=validatePartyLootDrop(action.drop||{},lootId);
        const revealed=action.revealNow===true;
        const secretItem=drop.kind==='item'?validateGMRewardPayload({
          items:[action.drop.item],currency:{key:'copper',amount:0}
        }).items[0]:null;
        const base={...drop,createdBy:currentUser.uid,
          createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
        if(revealed)tx.set(publicRef,{...base,visibility:'revealed'});
        // Keep canonical item metadata GM-only, including the true identity of
        // unappraised finds. Player-facing loot contains a sanitized preview.
        tx.set(privateRef,{...base,visibility:revealed?'revealed':'hidden',
          ...(secretItem?{secretItem}:{})});
        return {lootId,revealed};
      }
      if(type==='reveal'){
        if(!hidden)throw Error('No hidden loot drop is available to reveal.');
        if(hidden.status!=='available'||hidden.visibility!=='hidden')throw Error('Only available hidden loot can be revealed.');
        if(visible)throw Error('A revealed loot drop already exists with this identifier.');
        const publicDrop={...hidden};
        delete publicDrop.secretItem;
        tx.set(publicRef,{...publicDrop,visibility:'revealed',updatedAt:serverTimestamp(),
          revealedAt:serverTimestamp(),revealedBy:currentUser.uid});
        tx.update(privateRef,{visibility:'revealed',updatedAt:serverTimestamp()});
        return {lootId,revealed:true};
      }
      const target=visible?publicRef:privateRef,existing=visible||hidden;
      if(!existing)throw Error('This loot drop no longer exists.');
      if(existing.status!=='available')throw Error('Claimed or distributed loot cannot be cancelled.');
      tx.update(target,{status:'cancelled',updatedAt:serverTimestamp(),
        cancelledBy:currentUser.uid,cancelledAt:serverTimestamp()});
      if(visible&&hidden)tx.update(privateRef,{status:'cancelled',updatedAt:serverTimestamp()});
      return {lootId,cancelled:true};
    }),

    claimPartyLoot:async(campaignId,characterId,operation={})=>result(async tx=>{
      const lootId=requireId(String(operation.lootId||''),'loot drop');
      await requireLiveSession(tx,campaignId);
      const refs=liveCharacterRefs(campaignId,characterId);
      const [snapshot,lootSnapshot,privateSnapshot]=await Promise.all([
        tx.get(refs.campaign),tx.get(lootRef(campaignId,lootId)),
        tx.get(draftRef(campaignId,lootId))
      ]);
      if(!exists(snapshot))throw Error('Character not found.');
      if(!exists(lootSnapshot))throw Error('This loot is not revealed to the party.');
      const drop=lootSnapshot.data();
      if(drop.kind!=='item'||drop.status!=='available'||drop.visibility!=='revealed')
        throw Error('This loot drop cannot be claimed.');
      const character={...snapshot.data(),id:characterId};
      await checkLinked(tx,campaignId,characterId,character);
      await verifyOwnedLiveCharacter(tx,campaignId,characterId,character,refs);
      if(!refs.privateExists)throw Error('Owner character record unavailable; loot remains unclaimed.');
      checkCombat(refs,characterId);
      const storageId=requireId(String(operation.storageId||''),'inventory storage');
      const original=exists(privateSnapshot)?privateSnapshot.data():null;
      if(original&&original.status!=='available')throw Error('This loot is no longer claimable.');
      const placed=placeCharacterItem(character,copy(original?.secretItem||drop.item),{storageId});
      appendActivity(character,{type:'party-loot-claimed',message:'Claimed '+(drop.item?.name||'loot')+' from '+drop.source+'.'});
      writeLiveCharacter(tx,refs,character);
      tx.update(lootRef(campaignId,lootId),{
        status:'claimed',claimedByCharacterId:characterId,claimedByOwnerUid:currentUser.uid,
        claimedAt:serverTimestamp(),updatedAt:serverTimestamp()
      });
      if(original)tx.update(draftRef(campaignId,lootId),{
        status:'claimed',claimedByCharacterId:characterId,updatedAt:serverTimestamp()
      });
      return {lootId,itemId:placed.id,claimed:true};
    }),

    movePartyStashItem:async(campaignId,characterId,operation={})=>result(async tx=>{
      await requireLiveSession(tx,campaignId);
      const type=String(operation.type||'');
      if(!['deposit','withdraw'].includes(type))throw Error('Choose deposit or withdraw.');
      const stashId=requireId(String(operation.stashId||''),'party stash');
      const itemId=requireId(String(operation.itemId||''),'inventory item');
      const qty=quantity(operation.quantity);
      const refs=liveCharacterRefs(campaignId,characterId);
      const [snapshot,stashSnapshot]=await Promise.all([
        tx.get(refs.campaign),tx.get(stashRef(campaignId,stashId))
      ]);
      if(!exists(snapshot))throw Error('Character not found.');
      if(!exists(stashSnapshot))throw Error('Shared container no longer exists.');
      const stash=validatePartyStash({},stashSnapshot.data(),stashId);
      if(stash.status!=='open')throw Error('The GM has closed this party container.');
      if(type==='deposit'&&!stash.allowDeposits)throw Error('The GM has disabled deposits to this container.');
      if(type==='withdraw'&&!stash.allowWithdrawals)throw Error('The GM has disabled withdrawals from this container.');
      const character={...snapshot.data(),id:characterId};
      await checkLinked(tx,campaignId,characterId,character);
      await verifyOwnedLiveCharacter(tx,campaignId,characterId,character,refs);
      if(!refs.privateExists)throw Error('Owner character record unavailable; no items were moved.');
      checkCombat(refs,characterId);
      if(type==='deposit'){
        const inventory=characterInventory(character);
        const index=inventory.findIndex((row,i)=>liveItemId(row,i)===itemId);
        if(index<0)throw Error('Your inventory no longer contains this item.');
        const item=inventory[index];
        if(item.equipped||item.locked||item.bound||item.questItem)
          throw Error('Equipped, locked, bound or quest items cannot be deposited.');
        if(!Number.isSafeInteger(item.qty)||item.qty<qty)throw Error('The item quantity has changed.');
        if(stash.items.length>=PARTY_STASH_MAX_ITEMS)throw Error('This shared container is full.');
        stash.items.push(safePartyStashEntry(item,'stash-item-'+requestId,qty));
        item.qty-=qty;
        if(item.qty===0)inventory.splice(index,1);
        character.inventory=inventory;
        appendActivity(character,{type:'party-stash-deposit',message:'Stored '+qty+' x '+item.name+' in '+stash.name+'.'});
      }else{
        const index=stash.items.findIndex(row=>row.id===itemId);
        if(index<0)throw Error('That shared item is no longer available.');
        const item=stash.items[index];
        if(!Number.isSafeInteger(item.qty)||item.qty<qty)throw Error('The shared item quantity has changed.');
        const storageId=requireId(String(operation.storageId||''),'inventory storage');
        placeCharacterItem(character,{...copy(item),qty},{storageId});
        item.qty-=qty;
        if(item.qty===0)stash.items.splice(index,1);
        appendActivity(character,{type:'party-stash-withdraw',message:'Withdrew '+qty+' x '+item.name+' from '+stash.name+'.'});
      }
      validatePartyContainerSize(stash);
      writeLiveCharacter(tx,refs,character);
      tx.update(stashRef(campaignId,stashId),{
        items:stash.items,updatedAt:serverTimestamp(),updatedBy:currentUser.uid
      });
      return {stashId,itemId,quantity:qty,direction:type};
    }),

    splitPartyLootCurrency:async(campaignId,_scope,operation={})=>result(async tx=>{
      await requireLiveSession(tx,campaignId);
      const campaign=await requireCampaignGM(tx,campaignId);
      const lootId=requireId(String(operation.lootId||''),'currency loot drop');
      const loot=await tx.get(lootRef(campaignId,lootId));
      if(!exists(loot))throw Error('The currency loot drop is not available.');
      const record=loot.data();
      if(record.kind!=='currency'||record.status!=='available'||record.visibility!=='revealed')
        throw Error('Only available revealed currency can be split.');
      if(!Number.isSafeInteger(record.currencyCopper)||record.currencyCopper<1||
         record.currencyCopper>PARTY_LOOT_MAX_COPPER)
        throw Error('Invalid party currency pool.');
      const shares=splitPartyCopper(record.currencyCopper,operation.recipientIds);
      const changes=[];
      for(const share of shares){
        const refs=liveCharacterRefs(campaignId,share.characterId);
        const snapshot=await tx.get(refs.campaign);
        if(!exists(snapshot))throw Error('A chosen party character no longer exists.');
        const character={...snapshot.data(),id:share.characterId};
        if(!isLinkedCharacter(campaign,share.characterId,character,campaignId))
          throw Error('A chosen party character is not linked to this campaign.');
        await verifyLiveTradeCounterparty(tx,campaignId,share.characterId,character,refs);
        if(refs.encounter?.status==='active'&&(refs.encounter.combatants||[]).some(row=>row.characterId===share.characterId))
          throw Error('Finish the encounter before splitting shared currency.');
        const balance=currencyTotal(character);
        if(!Number.isSafeInteger(balance)||balance<0||
           !Number.isSafeInteger(balance+share.copper))
          throw Error('A party character has an invalid currency balance.');
        setCurrencyTotal(character,balance+share.copper);
        appendActivity(character,{type:'party-currency-split',
          message:'Received '+share.copper+' copper from '+record.title+'.'});
        changes.push({share,refs,character});
      }
      // No database writes occur until every character and private mirror has passed validation.
      for(const {share,refs,character} of changes){
        writeLiveCharacter(tx,refs,character);
        if(share.copper>0){
          const eventId='party-currency-'+requestId+'-'+share.characterId;
          tx.set(doc(db,'campaigns',campaignId,'events',eventId),{
            id:eventId,type:'currency-reward',campaignId,
            targetCharacterId:share.characterId,targetOwnerUid:character.ownerUid,
            payload:{key:'copper',amount:share.copper,bundleName:record.title,
              message:'Shared party treasure distributed by the GM.'},
            status:'resolved',acknowledged:false,createdBy:currentUser.uid,
            createdAt:serverTimestamp(),resolvedAt:serverTimestamp()
          });
        }
      }
      tx.update(lootRef(campaignId,lootId),{
        status:'split',distribution:shares,distributedAt:serverTimestamp(),
        distributedBy:currentUser.uid,updatedAt:serverTimestamp()
      });
      return {lootId,shares,totalCopper:record.currencyCopper};
    })
  };
}
