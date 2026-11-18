import {validateOwnedRecord} from '../../../src/state/ownedCharacterRecords.mjs';
import {requireDashboardId,playerCharacterProjection,playerCampaignAccess,
  linkedCharacterAccess,matchesOwnedSource,playerCampaignProjection} from './playerDashboardModel.mjs';

/** Phase 6.2: ONE existing Firebase Auth/Firestore runtime and strict user scope.
 * Reads only; gameplay actions and dashboard-layout writes are later phases.
 */
export function createFirebasePlayerDashboardService({
  auth,db,firestoreSdk,readCanonical,enabled=false
}){
  if(!auth||!db||!firestoreSdk||typeof readCanonical!=='function')
    throw Error('A verified Firebase adapter is required.');
  const flags=Object.freeze({enabled:enabled===true});
  const same=uid=>{if(auth.currentUser?.uid!==uid)throw Error('Account changed. Reload this character.');};
  const ownedRef=(uid,id)=>firestoreSdk.doc(db,'users',uid,'characters',id);
  const campaignRef=id=>firestoreSdk.doc(db,'campaigns',id);
  const memberRef=(id,uid)=>firestoreSdk.doc(db,'campaigns',id,'members',uid);
  const sharedRef=(id,charId)=>firestoreSdk.doc(db,'campaigns',id,'characters',charId);
  const sessionRef=id=>firestoreSdk.doc(db,'campaigns',id,'liveSession','current');
  async function verified(){
    if(!flags.enabled)throw Error('The migrated Player Dashboard is disabled.');
    const user=auth.currentUser;
    if(!user?.uid)throw Error('Sign in to access the Player Dashboard.');
    const profile=await readCanonical(user);
    same(user.uid);
    if(!profile||profile.uid!==user.uid)throw Error('Your saved account profile could not be verified.');
    return user.uid;
  }
  const guarded=async(ref,denied)=>{
    try{return await firestoreSdk.getDocFromServer(ref);}
    catch{throw Error(denied);}
  };
  const readShared=async(uid,cid,charId)=>{
    if(!/^[a-zA-Z0-9_-]{1,160}$/.test(String(cid))||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(String(charId)))return null;
    try{
      const doc=await firestoreSdk.getDocFromServer(sharedRef(cid,charId));
      same(uid);
      return doc.exists()?{...doc.data(),id:doc.id}:null;
    }catch{same(uid);return null;}
  };
  const verifyOwned=async(uid,character)=>{
    if(!character||character.ownerUid!==uid||!character.id)return false;
    return validateOwnedRecord(character,uid,(cid,charId)=>readShared(uid,cid,charId));
  };
  function watchOwned(id,onUpdate,onError){
    requireDashboardId(id);
    let active=true,sequence=0;const unsubs=[];
    const close=()=>{active=false;sequence++;unsubs.splice(0).forEach(fn=>{try{fn();}catch{}});};
    const fail=error=>{if(!active)return;close();onError(error instanceof Error?error:Error('Character unavailable.'));};
    (async()=>{
      try{
        const uid=await verified();if(!active)return;
        const document=await guarded(ownedRef(uid,id),'This character is unavailable for your account.');
        same(uid);if(!document.exists())throw Error('This character is unavailable for your account.');
        if(!await verifyOwned(uid,{...document.data(),id:document.id}))
          throw Error('Character ownership or campaign link could not be verified.');
        if(!active)return;
        const unsubscribe=firestoreSdk.onSnapshot(ownedRef(uid,id),
          {includeMetadataChanges:true},async snapshot=>{
            if(!active||snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
            const current=++sequence;
            try{
              same(uid);
              if(!snapshot.exists())throw Error('Character no longer exists.');
              const record={...snapshot.data(),id:snapshot.id};
              if(!await verifyOwned(uid,record))throw Error('Character ownership or campaign link changed.');
              if(!active||sequence!==current)return;
              onUpdate(Object.freeze({mode:'owned',owner:true,character:playerCharacterProjection(record,{owned:true}),campaign:null}));
            }catch(error){if(active&&sequence===current)fail(error);}
          },fail);
        if(active)unsubs.push(unsubscribe);else unsubscribe();
      }catch(error){fail(error);}
    })();
    return close;
  }
  async function resolveCampaign(cid,id){
    requireDashboardId(cid);requireDashboardId(id);
    const uid=await verified();
    const campaignSnap=await guarded(campaignRef(cid),'Campaign access is unavailable for this account.');
    same(uid);
    if(!campaignSnap.exists())throw Error('Campaign is unavailable.');
    const campaign={...campaignSnap.data(),id:campaignSnap.id};
    const usesMember=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid;
    const memberSnap=usesMember?await guarded(memberRef(cid,uid),
      'Campaign membership is inactive or unavailable.'):null;
    same(uid);
    const member=memberSnap?.exists()?memberSnap.data():null;
    const access=playerCampaignAccess(campaign,member,uid,cid);
    if(!access.allowed)throw Error('Campaign membership is inactive or unavailable.');
    const charSnap=await guarded(sharedRef(cid,id),'Character access is unavailable.');
    same(uid);
    if(!charSnap.exists())throw Error('The linked character is unavailable.');
    const character={...charSnap.data(),id:charSnap.id};
    const relationship=linkedCharacterAccess(campaign,character,uid,access);
    if(!relationship.allowed)throw Error('You cannot view this campaign character.');
    let source=null;
    if(relationship.owned){
      const sid=character.sourceCharacterId||character.id;
      requireDashboardId(sid);
      const sourceSnap=await guarded(ownedRef(uid,sid),'The saved character could not be verified.');
      same(uid);
      if(!sourceSnap.exists())throw Error('The saved character could not be verified.');
      source={...sourceSnap.data(),id:sourceSnap.id};
      if(!matchesOwnedSource(source,character,cid,uid,campaign.membershipSchemaVersion??1))
        throw Error('Character ownership or campaign link changed.');
    }
    return {uid,campaign,member,character,source,relationship,usesMember};
  }
  function watchCampaign(cid,id,onUpdate,onError){
    requireDashboardId(cid);requireDashboardId(id);
    let active=true;const unsubs=[];
    const close=()=>{active=false;unsubs.splice(0).forEach(fn=>{try{fn();}catch{}});};
    const fail=error=>{if(!active)return;close();onError(error instanceof Error?error:Error('Character connection failed.'));};
    (async()=>{
      try{
        const initial=await resolveCampaign(cid,id);
        if(!active)return;
        const {uid,usesMember}=initial;
        const data={campaign:initial.campaign,member:initial.member,
          character:initial.character,source:initial.source,session:null};
        const confirmed={campaign:false,member:!usesMember,character:false,
          source:!initial.relationship.owned,session:false};
        const verify=()=>{
          same(uid);
          const access=playerCampaignAccess(data.campaign,data.member,uid,cid);
          if(!access.allowed)throw Error('Campaign access or membership was revoked.');
          const relationship=linkedCharacterAccess(data.campaign,data.character,uid,access);
          if(!relationship.allowed)throw Error('Character link or access was revoked.');
          if(relationship.owned&&!matchesOwnedSource(data.source,data.character,cid,uid,
            data.campaign.membershipSchemaVersion??1))
            throw Error('Saved character link changed.');
          return {access,relationship};
        };
        const publish=()=>{
          if(!active||!Object.values(confirmed).every(Boolean))return;
          try{
            const {access,relationship}=verify();
            onUpdate(Object.freeze({
              mode:'campaign',owner:relationship.owned,
              character:playerCharacterProjection(data.character,{owned:relationship.owned}),
              campaign:playerCampaignProjection(data.campaign,access,data.session)
            }));
          }catch(err){fail(err);}
        };
        const attach=(reference,key,decode)=> {
          const stop=firestoreSdk.onSnapshot(reference,{includeMetadataChanges:true},
            snap=>{
              if(!active||snap.metadata.fromCache||snap.metadata.hasPendingWrites)return;
              try{
                if(key!=='session'&&!snap.exists())
                  throw Error('Your campaign or character is no longer available.');
                data[key]=decode(snap);
                confirmed[key]=true;
                publish();
              }catch(err){fail(err);}
            },fail);
          if(active)unsubs.push(stop);else stop();
        };
        attach(campaignRef(cid),'campaign',snap=>({...snap.data(),id:snap.id}));
        if(usesMember)attach(memberRef(cid,uid),'member',snap=>({...snap.data()}));
        attach(sharedRef(cid,id),'character',snap=>({...snap.data(),id:snap.id}));
        if(initial.relationship.owned){
          const sourceId=initial.character.sourceCharacterId||initial.character.id;
          attach(ownedRef(uid,sourceId),'source',snap=>({...snap.data(),id:snap.id}));
        }
        attach(sessionRef(cid),'session',snap=>snap.exists()?snap.data():null);
      }catch(error){fail(error);}
    })();
    return close;
  }
  return Object.freeze({availability:()=>flags,watchOwned,watchCampaign});
}
