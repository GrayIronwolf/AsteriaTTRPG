import {randomInt} from 'node:crypto';
import {
 validateWeatherZone,validateWeatherAction,generateWeatherForecast,
 buildWeatherDay,publicWeatherReport,WEATHER_CONDITIONS,WEATHER_SEVERITIES,
 weatherIsValidId,MAX_FORECAST_DAYS
} from '../src/state/weatherEnvironmentModel.mjs';

const exists=s=>typeof s?.exists==='function'?s.exists():Boolean(s?.exists);
const bounded=(value,max)=>String(value||'').trim().slice(0,max);
const MAX_ZONES=40;
const MAX_REPORTS_PER_ZONE=60;

/**
 * Phase 8.2: GM-only server action through the existing asteriaAction
 * transaction + replay receipt. Shared forecasts are separate allowlisted
 * documents, never direct copies of private GM records.
 */
export function createWeatherEnvironmentCommands(context,{requireCampaignGM}){
 const {db,doc,runTransaction,serverTimestamp,currentUser,requestId}=context;
 return {
  manageWeatherEnvironment:async(campaignId,_scope,action={})=>{
   try{
    const type=validateWeatherAction(action);
    const result=await runTransaction(db,async tx=>{
     await requireCampaignGM(tx,campaignId);
     const zoneRef=action.zoneId?doc(db,'campaigns',campaignId,'weatherZones',action.zoneId):null;
     const reportRef=action.reportId?doc(db,'campaigns',campaignId,'weatherReports',action.reportId):null;
     const publicRef=action.reportId?doc(db,'campaigns',campaignId,'weatherSharedReports',action.reportId):null;
     const metaRef=doc(db,'campaigns',campaignId,'weatherConfig','current');
     if(type==='saveZone'||type==='archiveZone'){
      // Read every document used by this transaction before writing.
      const [snapshot,metaSnapshot]=await Promise.all([tx.get(zoneRef),tx.get(metaRef)]);
      const previous=exists(snapshot)?snapshot.data():null;
      const meta=metaSnapshot?.data()||{};
      if((previous?.revision||0)!==action.expectedRevision)
       throw Error('This weather zone changed. Refresh before saving.');
      if(type==='archiveZone'){
       if(!previous||previous.status==='archived')
        throw Error('Only an active weather zone can be archived.');
       // Existing published forecasts remain independently manageable.
       tx.update(zoneRef,{status:'archived',revision:previous.revision+1,
        updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
       tx.set(metaRef,{zoneCount:Math.max(0,(meta.zoneCount||0)-1),
        updatedAt:serverTimestamp()},{merge:true});
       return {zoneId:action.zoneId,revision:previous.revision+1,status:'archived'};
      }
      if(!previous&&(meta.zoneCount||0)>=MAX_ZONES)
       throw Error('The campaign supports at most '+MAX_ZONES+' active weather zones.');
      const clean=validateWeatherZone(action.zone,action.zoneId,previous);
      tx.set(zoneRef,{...clean,reportCount:previous?.reportCount||0,
       createdBy:previous?.createdBy||currentUser.uid,
       createdAt:previous?.createdAt||serverTimestamp(),
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
      if(!previous)tx.set(metaRef,{zoneCount:(meta.zoneCount||0)+1,
       updatedAt:serverTimestamp()},{merge:true});
      return {zoneId:action.zoneId,revision:clean.revision,status:'active'};
     }
     if(type==='generate'){
      if(!weatherIsValidId(requestId)||requestId.length>95)
       throw Error('The weather request identifier is invalid.');
      const reportId='weather-report-'+requestId;
      const generatedRef=doc(db,'campaigns',campaignId,'weatherReports',reportId);
      const calendarRef=doc(db,'campaigns',campaignId,'calendarState','current');
      const [zoneSnap,calendarSnap,existing]=await Promise.all([
       tx.get(zoneRef),tx.get(calendarRef),tx.get(generatedRef)
      ]);
      const zone=zoneSnap?.data(),calendar=calendarSnap?.data();
      if(!exists(zoneSnap)||zone.status!=='active')
       throw Error('Select an active weather zone.');
      if(zone.revision!==action.expectedZoneRevision)
       throw Error('The zone settings changed. Refresh before generating.');
      if(!exists(calendarSnap)||!calendar?.definition||!calendar?.date)
       throw Error('Configure the campaign Asteria Calendar first.');
      if(exists(existing))throw Error('This weather report was already generated.');
      if((zone.reportCount||0)>=MAX_REPORTS_PER_ZONE)
       throw Error('Archive old weather reports before generating more for this zone.');
      // Randomness occurs inside the authenticated server action, not in the browser.
      const forecast=generateWeatherForecast(zone,calendar,action.days,randomInt);
      const report={id:reportId,zoneId:zone.id,zoneName:zone.name,region:zone.region,
       biome:zone.biome,status:'draft',revision:1,zoneRevision:zone.revision,
       calendarRevision:calendar.revision,
       generatedFromDate:calendar.date,forecast,
       gmNotes:zone.gmNotes||'',changes:[],
       createdBy:currentUser.uid,createdAt:serverTimestamp(),
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(generatedRef,report);
      tx.update(zoneRef,{reportCount:(zone.reportCount||0)+1,
       updatedAt:serverTimestamp()});
      return {reportId,revision:1,status:'draft',days:forecast.length,published:false};
     }
     const snap=await tx.get(reportRef),previous=snap?.data();
     if(!exists(snap))throw Error('This weather report no longer exists.');
     if(previous.revision!==action.expectedRevision)
      throw Error('The weather report changed. Refresh before editing.');
     if(previous.status==='archived')throw Error('An archived weather report cannot be edited.');
     if(type==='archive'){
      tx.update(reportRef,{status:'archived',revision:previous.revision+1,
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()});
      tx.delete(publicRef);
      return {reportId:previous.id,revision:previous.revision+1,status:'archived'};
     }
     if(type==='unpublish'){
      if(previous.status!=='published')throw Error('Only published reports can be withdrawn.');
      const updated={...previous,revision:previous.revision+1,status:'draft',
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(reportRef,updated);
      tx.delete(publicRef);
      return {reportId:previous.id,revision:updated.revision,status:'draft'};
     }
     if(type==='publish'){
      if(previous.status!=='draft')throw Error('Only a GM-reviewed draft can be published.');
      if(!Array.isArray(previous.forecast)||!previous.forecast.length||
       previous.forecast.length>MAX_FORECAST_DAYS)
       throw Error('The forecast contains an invalid number of days.');
      const updated={...previous,revision:previous.revision+1,status:'published',
       reviewedBy:currentUser.uid,updatedBy:currentUser.uid,
       publishedAt:serverTimestamp(),updatedAt:serverTimestamp()};
      tx.set(reportRef,updated);
      tx.set(publicRef,{...publicWeatherReport(updated),updatedAt:serverTimestamp()});
      return {reportId:previous.id,revision:updated.revision,status:'published'};
     }
     if(type==='override'){
      if(!Array.isArray(previous.forecast)||action.dayIndex>=previous.forecast.length)
       throw Error('Choose a day included in the weather forecast.');
      const days=previous.forecast.map((day,index)=>index===action.dayIndex?
       buildWeatherDay(day.date,day.season,action.condition,action.severity,index,'gm-override'):day);
      const update={...previous,forecast:days,revision:previous.revision+1,
       changes:[{dayIndex:action.dayIndex,condition:action.condition,
        severity:action.severity,reason:bounded(action.reason,180),
        actorUid:currentUser.uid,at:serverTimestamp()},...(previous.changes||[])].slice(0,40),
       updatedBy:currentUser.uid,updatedAt:serverTimestamp()};
      tx.set(reportRef,update);
      if(update.status==='published'){
       tx.set(publicRef,{...publicWeatherReport(update),updatedAt:serverTimestamp()});
      }
      return {reportId:update.id,revision:update.revision,status:update.status};
     }
     throw Error('Unsupported weather operation.');
    });
    return {ok:true,...result};
   }catch(error){return {ok:false,error:error?.message||String(error)};}
  }
 };
}
