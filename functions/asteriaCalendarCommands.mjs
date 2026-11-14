import {
 ASTERIA_CALENDAR_ID,MAX_CALENDAR_HISTORY,MAX_CALENDAR_ENTRIES,
 validateCalendarAction,validateCalendarDefinition,validateCalendarDate,
 validateCalendarEntry,calendarSourceReferences,advanceAsteriaDate
} from '../src/state/asteriaCalendarModel.mjs';

const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const text=value=>String(value||'').trim().slice(0,180);

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
      const updated={id:ASTERIA_CALENDAR_ID,revision:revision+1,definition,date,
       entryCount:previous?.entryCount||0,history:[
        {requestId,revision:revision+1,type:'configure',actorUid:currentUser.uid,reason:text(action.reason),date},
        ...(previous?.history||[])
       ].slice(0,MAX_CALENDAR_HISTORY),updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(privateRef,updated);
      tx.set(publicRef,{id:ASTERIA_CALENDAR_ID,revision:updated.revision,definition,date,
       updatedAt:serverTimestamp()});
      return {revision:updated.revision,date,configured:true};
     }
     if(!previous?.definition||!previous?.date)
      throw Error('The GM must configure the Asteria calendar before continuing.');
     const definition=validateCalendarDefinition(previous.definition);
     if(type==='advance'||type==='set'){
      const date=type==='advance'
       ?advanceAsteriaDate(previous.date,definition,action.unit,action.amount)
       :validateCalendarDate(action.date,definition);
      const updated={...previous,revision:revision+1,date,
       history:[{requestId,revision:revision+1,type,actorUid:currentUser.uid,
        reason:text(action.reason),date,
        ...(type==='advance'?{unit:action.unit,amount:action.amount}:{})},
        ...(previous.history||[])].slice(0,MAX_CALENDAR_HISTORY),
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(privateRef,updated);
      tx.set(publicRef,{id:ASTERIA_CALENDAR_ID,definition,date,revision:updated.revision,
       updatedAt:serverTimestamp()});
      return {revision:updated.revision,date,configured:true};
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
      return {entryId,status:'archived',revision:revision+1,entryRevision:oldEntry.revision+1};
     }
     if(!oldEntry&&(previous.entryCount||0)>=MAX_CALENDAR_ENTRIES)
      throw Error('The campaign calendar supports up to '+MAX_CALENDAR_ENTRIES+' active entries.');
     const clean=validateCalendarEntry(action.entry,definition,entryId,oldEntry);
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
       kind:entry.kind,date:entry.date,visibility:'party',status:'active',
       revision:entry.revision,updatedAt:serverTimestamp()};
      tx.set(sharedEntryRef,projection);
     }else tx.delete(sharedEntryRef);
     tx.update(privateRef,{revision:revision+1,
      entryCount:(previous.entryCount||0)+(oldEntry?0:1),
      updatedAt:serverTimestamp(),updatedBy:currentUser.uid});
     return {entryId,status:'active',revision:revision+1,entryRevision:entry.revision,
      visibility:entry.visibility};
    });
    return {ok:true,...result};
   }catch(error){return {ok:false,error:error?.message||String(error)};}
  }
 };
}
