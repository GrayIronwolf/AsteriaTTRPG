import {
 ASTERIA_CALENDAR_ID,MAX_CALENDAR_HISTORY,MAX_CALENDAR_ENTRIES,
 validateCalendarAction,validateCalendarDefinition,validateCalendarDate,
 validateCalendarEntry,calendarSourceReferences,advanceAsteriaDate,
 validateCalendarCategories,DEFAULT_CALENDAR_CATEGORIES,effectiveCalendarDate
} from '../src/state/asteriaCalendarModel.mjs';

const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const text=value=>String(value||'').trim().slice(0,180);
const clockProjection=state=>({
 id:ASTERIA_CALENDAR_ID,revision:state.revision,
 definitionVersion:state.definitionVersion||1,definition:state.definition,
 date:state.date,clockMode:state.clockMode||'manual',
 clockRate:state.clockRate||1,clockAnchorMs:state.clockAnchorMs??null,
 categories:state.categories||DEFAULT_CALENDAR_CATEGORIES
});


/**
 * All updates use the existing authenticated, receipt-backed asteriaAction
 * transaction and require a current campaign GM. No player writes are enabled.
 */
export function createAsteriaCalendarCommands(context,{requireCampaignGM}){
 const {db,doc,runTransaction,requestId,serverTimestamp,currentUser}=context;
 return {
  manageAsteriaCalendar:async(campaignId,_scope,action={})=>{
   try{
    const {type,expectedRevision}=validateCalendarAction(action);
    const result=await runTransaction(db,async tx=>{
     await requireCampaignGM(tx,campaignId);
     const privateRef=doc(db,'campaigns',campaignId,'calendarState','current');
     const publicRef=doc(db,'campaigns',campaignId,'calendarPublic','current');
     const snapshot=await tx.get(privateRef);
     const previous=exists(snapshot)?snapshot.data():null;
     const revision=previous?.revision||0;
     if(revision!==expectedRevision)
      throw Error('The calendar changed. Refresh its latest revision.');
     if(type==='configure'){
      const definition=validateCalendarDefinition(action.definition);
      const date=validateCalendarDate(action.date,definition);
      if(previous?.definition&&previous?.entryCount>0)
       throw Error('Calendar rules are locked while dated events exist. Archive existing events before changing month lengths.');
      const updated={id:ASTERIA_CALENDAR_ID,revision:revision+1,
        definitionVersion:(previous?.definitionVersion||0)+1,definition,date,
        clockMode:'manual',clockRate:1,clockAnchorMs:null,
        categories:previous?.categories||DEFAULT_CALENDAR_CATEGORIES,
       entryCount:previous?.entryCount||0,history:[
        {requestId,revision:revision+1,type:'configure',actorUid:currentUser.uid,reason:text(action.reason),date},
        ...(previous?.history||[])
       ].slice(0,MAX_CALENDAR_HISTORY),updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(privateRef,updated);
      tx.set(publicRef,{...clockProjection(updated),updatedAt:serverTimestamp()});
      return {revision:updated.revision,date,configured:true};
     }
     if(!previous?.definition||!previous?.date)
      throw Error('The GM must configure the Asteria calendar before continuing.');
     const definition=validateCalendarDefinition(previous.definition);

     if(type==='setCategories'){
      const categories=validateCalendarCategories(action.categories);
      const updated={...previous,revision:revision+1,categories,
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(privateRef,updated);
      tx.set(publicRef,{...clockProjection(updated),updatedAt:serverTimestamp()});
      return {revision:updated.revision,categories,configured:true};
     }
     if(['advance','set','setClock','undoTime'].includes(type)){
      const nowMs=Date.now();
      const liveDate=effectiveCalendarDate(previous,nowMs);
      let date=liveDate,mode=previous.clockMode||'manual',rate=previous.clockRate||1;
      let anchor=mode==='realtime'?nowMs:null;
      if(type==='advance')date=advanceAsteriaDate(liveDate,definition,action.unit,action.amount);
      if(type==='set')date=validateCalendarDate(action.date,definition);
      if(type==='setClock'){
       mode=action.clockMode;rate=action.clockRate;
       anchor=mode==='realtime'?nowMs:null;
      }
      if(type==='undoTime'){
       const latest=previous.history?.[0];
       if(!latest?.previousDate||!['advance','set','setClock'].includes(latest.type))
        throw Error('The latest history item has no reversible time change.');
       date=validateCalendarDate(latest.previousDate,definition);
       mode=latest.previousClockMode||'manual';
       rate=latest.previousClockRate||1;
       anchor=mode==='realtime'?nowMs:null;
      }
      const historyEntry={requestId,revision:revision+1,type,
       actorUid:currentUser.uid,reason:text(action.reason),date,
       previousDate:liveDate,
       previousClockMode:previous.clockMode||'manual',
       previousClockRate:previous.clockRate||1,
       ...(type==='advance'?{unit:action.unit,amount:action.amount}:{})};
      const updated={...previous,revision:revision+1,date,
       clockMode:mode,clockRate:rate,clockAnchorMs:anchor,
       history:[historyEntry,...(previous.history||[])].slice(0,MAX_CALENDAR_HISTORY),
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(privateRef,updated);
      tx.set(publicRef,{...clockProjection(updated),updatedAt:serverTimestamp()});
      return {revision:updated.revision,date,clockMode:mode,clockRate:rate,configured:true};
     }
     const entryId=action.entryId;
     if(!validId(entryId))throw Error('Choose a valid calendar event.');
     const privateEntryRef=doc(db,'campaigns',campaignId,'calendarEntries',entryId);
     const sharedEntryRef=doc(db,'campaigns',campaignId,'calendarSharedEntries',entryId);
     const entrySnap=await tx.get(privateEntryRef);
     const oldEntry=exists(entrySnap)?entrySnap.data():null;
     if((oldEntry?.revision||0)!==action.expectedEntryRevision)
      throw Error('The calendar event changed. Refresh its revision.');
     if(type==='archiveEntry'){
      if(!oldEntry||oldEntry.status==='archived')throw Error('Only an existing active event can be archived.');
      tx.update(privateEntryRef,{status:'archived',revision:oldEntry.revision+1,
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
      tx.delete(sharedEntryRef);
      tx.update(privateRef,{revision:revision+1,
       entryCount:Math.max(0,(previous.entryCount||0)-1),updatedAt:serverTimestamp(),
       updatedBy:currentUser.uid});
      tx.update(publicRef,{revision:revision+1,updatedAt:serverTimestamp()});
      return {entryId,status:'archived',revision:revision+1,entryRevision:oldEntry.revision+1};
     }
     if(!oldEntry&&(previous.entryCount||0)>=MAX_CALENDAR_ENTRIES)
      throw Error('The campaign calendar supports up to '+MAX_CALENDAR_ENTRIES+' active entries.');
     const clean=validateCalendarEntry(action.entry,definition,entryId,oldEntry,
      previous.categories||DEFAULT_CALENDAR_CATEGORIES);
     if(clean.related){
      const workspaceSnap=await tx.get(doc(db,'campaigns',campaignId,'systems','gmWorkspace'));
      const sources=calendarSourceReferences(workspaceSnap?.data()||{});
      if(!sources.some(row=>row.type===clean.related.type&&row.id===clean.related.id))
       throw Error('The linked campaign record no longer exists.');
      // An internal world event can remain unpublished even while the
      // corresponding calendar entry is explicitly shared. Do not expose
      // source titles, notes or private record bodies to the party.
     }
     const entry={...clean,createdAt:oldEntry?.createdAt||serverTimestamp(),
      createdBy:oldEntry?.createdBy||currentUser.uid,
      updatedAt:serverTimestamp(),updatedBy:currentUser.uid};
     tx.set(privateEntryRef,entry);
     if(entry.visibility==='party'){
      const projection={id:entryId,title:entry.title,description:entry.description,
       kind:entry.kind,date:entry.date,categoryId:entry.categoryId,
        recurrence:entry.recurrence||null,visibility:'party',status:'active',
       revision:entry.revision,updatedAt:serverTimestamp()};
      tx.set(sharedEntryRef,projection);
     }else tx.delete(sharedEntryRef);
     tx.update(privateRef,{revision:revision+1,
      entryCount:(previous.entryCount||0)+(oldEntry?0:1),
      updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
     tx.update(publicRef,{revision:revision+1,updatedAt:serverTimestamp()});
     return {entryId,status:'active',revision:revision+1,entryRevision:entry.revision,
      visibility:entry.visibility};
    });
    return {ok:true,...result};
   }catch(error){return {ok:false,error:error?.message||String(error)};}
  }
 };
}
