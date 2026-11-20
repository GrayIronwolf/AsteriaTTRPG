import {normalizeDashboardLayout,layoutFromPlayerPreferences} from '../../../src/state/dashboardLayoutModel.mjs';
import {gmSessionState} from '../dashboard/gmDashboardModel.mjs';
import {validateOwnedRecord} from '../../../src/state/ownedCharacterRecords.mjs';
import {validateJournalDraft,changeJournalRows} from './playerJournalModel.mjs';
import {validateGalleryUpload,mergedGalleryRows,galleryStoragePath,
  assertOwnedGalleryPath,MAX_GALLERY_IMAGES} from './playerGalleryModel.mjs';
import {validatePlayerQuestAction} from './playerQuestModel.mjs';
import {publishedInformation,scopedEventProjection,assertNoticeAction} from './playerInformationModel.mjs';
import {DASHBOARD_ID,requireDashboardId,playerCharacterProjection,playerCampaignAccess,
  linkedCharacterAccess,matchesOwnedSource,playerCampaignProjection} from './playerDashboardModel.mjs';

/** Phase 6.2: ONE existing Firebase Auth/Firestore runtime and strict user scope.
 * Reads only; gameplay actions and dashboard-layout writes are later phases.
 */
export function createFirebasePlayerDashboardService({
  auth,db,firestoreSdk,readCanonical,functions=null,functionsSdk=null,
  storage=null,storageSdk=null,
  enabled=false,layoutEnabled=false
}){
  if(!auth||!db||!firestoreSdk||typeof readCanonical!=='function')
    throw Error('A verified Firebase adapter is required.');
  const flags=Object.freeze({enabled:enabled===true,layoutEnabled:layoutEnabled===true});
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
              character:playerCharacterProjection(relationship.owned&&
                !data.character.dashboardPreferences?.dashboardLayout&&data.source?.dashboardPreferences?.dashboardLayout
                ?{...data.character,dashboardPreferences:data.source.dashboardPreferences}:data.character,
                {owned:relationship.owned,ownerSource:relationship.owned?data.source:null}),
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

  const layoutValue=preferences=>layoutFromPlayerPreferences(preferences||{});
  const sameLayout=(a,b)=>JSON.stringify(layoutValue(a))===
    JSON.stringify(normalizeDashboardLayout(b,'player'));
  const layoutPatch=(record,next)=>({
    dashboardPreferences:{...(record.dashboardPreferences||{}),dashboardLayout:next},
    updatedAt:firestoreSdk.serverTimestamp()
  });
  const verifyLayoutInput=layout=>{
    const normalized=normalizeDashboardLayout(layout,'player');
    if(JSON.stringify(normalized).length>400*1024)
      throw Error('Dashboard layout is too large.');
    return normalized;
  };
  function mustEditLayout(){
    if(!flags.layoutEnabled)throw Error('The migrated dashboard editor is disabled.');
  }
  /** Only the canonical owner record changes; there is no campaign write for
   * an unassigned character and no requirement for an active game session. */
  async function saveOwnedLayout(id,layout,expected){
    mustEditLayout();requireDashboardId(id);
    const uid=await verified(),next=verifyLayoutInput(layout);
    await firestoreSdk.runTransaction(db,async tx=>{
      const snap=await tx.get(ownedRef(uid,id));
      same(uid);
      if(!snap.exists())throw Error('Saved character is unavailable.');
      const source={...snap.data(),id:snap.id};
      if(source.ownerUid!==uid)throw Error('Only the character owner may edit this layout.');
      const trusted=await validateOwnedRecord(source,uid,async(cid,charId)=>{
        requireDashboardId(cid);requireDashboardId(charId);
        const linked=await tx.get(sharedRef(cid,charId));
        same(uid);
        return linked.exists()?{...linked.data(),id:linked.id}:null;
      });
      same(uid);
      if(!trusted)throw Error('Character ownership or campaign link changed.');
      if(!sameLayout(source.dashboardPreferences,expected))
        throw Error('Dashboard layout changed in another session. Reload before saving.');
      tx.update(ownedRef(uid,id),layoutPatch(source,next));
    });
    same(uid);return {ok:true};
  }
  /** Existing v1/v2 server-owned character IDs are authoritative. Both live
   * gameplay sheet and private source receive the same layout in one transaction.
   * Never write skills, resources, equipment, membership or campaign metadata. */
  async function saveCampaignLayout(cid,id,layout,expected){
    mustEditLayout();requireDashboardId(cid);requireDashboardId(id);
    const uid=await verified(),next=verifyLayoutInput(layout);
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(campaignRef(cid));
      if(!campaignSnap.exists())throw Error('Campaign is unavailable.');
      const campaign={...campaignSnap.data(),id:campaignSnap.id};
      const memberSnap=campaign.membershipSchemaVersion===2&&campaign.ownerUid!==uid
        ?await tx.get(memberRef(cid,uid)):null;
      const sharedSnap=await tx.get(sharedRef(cid,id));
      same(uid);
      const member=memberSnap?.exists()?memberSnap.data():null;
      const access=playerCampaignAccess(campaign,member,uid,cid);
      if(!access.allowed||!sharedSnap.exists())
        throw Error('Campaign membership or character is unavailable.');
      const shared={...sharedSnap.data(),id:sharedSnap.id};
      const permission=linkedCharacterAccess(campaign,shared,uid,access);
      if(!permission.allowed||!permission.owned)
        throw Error('Only the linked character owner may change its layout.');
      const sourceId=shared.sourceCharacterId||shared.id;
      requireDashboardId(sourceId);
      const sourceSnap=await tx.get(ownedRef(uid,sourceId));
      same(uid);
      if(!sourceSnap.exists())throw Error('Saved character source is missing.');
      const source={...sourceSnap.data(),id:sourceSnap.id};
      if(!matchesOwnedSource(source,shared,cid,uid,campaign.membershipSchemaVersion??1))
        throw Error('Character ownership or campaign link changed.');
      const preferences=shared.dashboardPreferences?.dashboardLayout
        ?shared.dashboardPreferences:source.dashboardPreferences;
      if(!sameLayout(preferences,expected))
        throw Error('Dashboard layout changed in another session. Reload before saving.');
      tx.update(sharedRef(cid,id),layoutPatch(shared,next));
      tx.update(ownedRef(uid,sourceId),layoutPatch(source,next));
    });
    same(uid);return {ok:true};
  }

  /** Original HP/SP/MP +/- actions use the existing receipt-backed callable,
   * with fresh linked-owner verification and server-enforced live-session rules.
   * No direct Firestore resource writes or second Firebase app. */
  async function adjustResource(cid,id,key,delta){
    requireDashboardId(cid);requireDashboardId(id);
    const resource=String(key||'').toLowerCase();
    const amount=Number(delta);
    if(!['hp','sp','mp'].includes(resource)||!Number.isSafeInteger(amount)||
      amount===0||Math.abs(amount)>10000)
      throw Error('Invalid resource adjustment.');
    if(!functions||!functionsSdk?.httpsCallable)
      throw Error('Live character resource actions are unavailable.');
    const {uid,relationship}=await resolveCampaign(cid,id);
    if(!relationship.owned)
      throw Error('Only the linked character owner can adjust resources.');
    const session=await guarded(sessionRef(cid),'Live session is unavailable.');
    same(uid);
    if(!session.exists()||gmSessionState(session.data()).editable!==true)
      throw Error('Start an editable campaign session to adjust resources.');
    const callable=functionsSdk.httpsCallable(functions,'asteriaAction');
    const result=await callable({action:'updateCampaignCharacterResource',
      args:[cid,id,resource,amount,{source:'React Player Dashboard HUD'}],
      requestId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)throw Error(result.data?.error||'Resource update rejected.');
    return result.data;
  }

  // All existing character-system mutations remain authoritative server actions.
  // The player cannot apply GM-only conditions or directly alter Firestore fields.
  async function characterSystemAction(cid,id,action,args=[]){
    requireDashboardId(cid);requireDashboardId(id);
    if(!['manageCharacterCondition','takeCampaignCharacterRest',
      'updateCampaignCharacterCurrency','updateCharacterInventory','castCharacterSpell',
      'updateCharacterQuest','updateQuestProgress'].includes(action))
      throw Error('Unsupported character system action.');
    if(!functions||!functionsSdk?.httpsCallable)
      throw Error('Character system actions are unavailable.');
    const {uid,relationship}=await resolveCampaign(cid,id);
    if(!relationship.owned)throw Error('Only the linked character owner can perform this action.');
    const snapshot=await guarded(sessionRef(cid),'Live session is unavailable.');
    same(uid);
    if(!snapshot.exists()||gmSessionState(snapshot.data()).editable!==true)
      throw Error('Start an editable campaign session to use character actions.');
    const callable=functionsSdk.httpsCallable(functions,'asteriaAction');
    const result=await callable({action,args:[cid,id,...args],
      requestId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)
      throw Error(result.data?.error||'Character system action rejected.');
    return result.data;
  }
  async function questCommand(cid,id,kind,questId,value){
    const valid=validatePlayerQuestAction(questId,kind,value);
    const command=kind==='status'?'updateCharacterQuest':'updateQuestProgress';
    const args=kind==='status'?[valid.questId,valid.status]:[valid.questId,valid.patch];
    return characterSystemAction(cid,id,command,args);
  }
  const updateQuestStatus=(cid,id,questId,status)=>
    questCommand(cid,id,'status',questId,status);
  const updateQuestProgress=(cid,id,questId,patch)=>
    questCommand(cid,id,'progress',questId,patch);
  async function removeCondition(cid,id,conditionId){
    if(typeof conditionId!=='string'||!DASHBOARD_ID.test(conditionId))
      throw Error('Invalid condition identifier.');
    return characterSystemAction(cid,id,'manageCharacterCondition',
      [{action:'remove',id:conditionId}]);
  }
  async function takeRest(cid,id,type,options={}){
    if(!['short','long'].includes(type))throw Error('Invalid rest type.');
    const soulRecovery=Number(options.soulRecovery??0);
    const expectedSequence=Number(options.expectedSequence);
    if(!Number.isSafeInteger(soulRecovery)||soulRecovery<0||soulRecovery>1000000||
      !Number.isSafeInteger(expectedSequence)||expectedSequence<0)
      throw Error('Invalid rest request.');
    return characterSystemAction(cid,id,'takeCampaignCharacterRest',
      [type,{soulRecovery,expectedSequence}]);
  }
  async function adjustCurrency(cid,id,denomination,delta){
    if(typeof denomination!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(denomination))
      throw Error('Invalid currency type.');
    const amount=Number(delta);
    if(!Number.isSafeInteger(amount)||amount===0||Math.abs(amount)>1000000)
      throw Error('Invalid currency amount.');
    return characterSystemAction(cid,id,'updateCampaignCharacterCurrency',
      [denomination,amount,{source:'React Player Dashboard Currency'}]);
  }

  async function useQuickItem(cid,id,itemId,expectedRevision){
    if(typeof itemId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(itemId))
      throw Error('Invalid quick-item identifier.');
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
      throw Error('Invalid character revision.');
    return characterSystemAction(cid,id,'updateCharacterInventory',
      [{type:'use',itemId,expectedCoreRevision:expectedRevision}]);
  }

  async function castSpell(cid,id,spellName){
    if(typeof spellName!=='string'||!spellName.trim()||spellName.length>100)
      throw Error('Select a known spell.');
    // The server checks that the character knows the spell and computes
    // canonical MP cost. Never trust a cost supplied by the browser.
    return characterSystemAction(cid,id,'castCharacterSpell',
      [{name:spellName.trim()},{}]);
  }


  /** All journal writes reuse the same owner, campaign-link and live-session
   * verification; edits/deletes compare the original entry on BOTH copies. */
  async function writeJournal(cid,id,operation,payload){
    requireDashboardId(cid);requireDashboardId(id);
    if(!['add','update','delete'].includes(operation))
      throw Error('Unsupported journal operation.');
    const entry=operation==='add'?validateJournalDraft(payload):null;
    const {uid,relationship}=await resolveCampaign(cid,id);
    if(!relationship.owned)throw Error('Only the character owner may edit their journal.');
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(campaignRef(cid));
      const memberSnap=campaignSnap.exists()&&campaignSnap.data().membershipSchemaVersion===2&&
        campaignSnap.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      const characterSnap=await tx.get(sharedRef(cid,id));
      const sourceId=characterSnap.exists()?(characterSnap.data().sourceCharacterId||id):id;
      requireDashboardId(sourceId);
      const privateSnap=await tx.get(ownedRef(uid,sourceId));
      const sessionSnap=await tx.get(sessionRef(cid));
      same(uid);
      if(!campaignSnap.exists()||!characterSnap.exists()||
        !playerCampaignAccess({...campaignSnap.data(),id:cid},
          memberSnap?.exists()?memberSnap.data():null,uid,cid).allowed||
        !linkedCharacterAccess({...campaignSnap.data(),id:cid},
          {...characterSnap.data(),id},uid,{allowed:true,isGM:false}).owned)
        throw Error('Character ownership or campaign access changed.');
      if(!privateSnap.exists()||privateSnap.data().ownerUid!==uid||
        !matchesOwnedSource({...privateSnap.data(),id:sourceId},
          {...characterSnap.data(),id},cid,uid,campaignSnap.data().membershipSchemaVersion??1))
        throw Error('Original saved character link changed.');
      if(!sessionSnap.exists()||gmSessionState(sessionSnap.data()).editable!==true)
        throw Error('Start an editable campaign session to change journal entries.');
      const sharedRows=Array.isArray(characterSnap.data().journal)?characterSnap.data().journal:[];
      const privateRows=Array.isArray(privateSnap.data().journal)?privateSnap.data().journal:[];
      let updatedShared,updatedPrivate;
      if(operation==='add'){
        if(sharedRows.length>=500||privateRows.length>=500)
          throw Error('Journal is full. Archive older entries before adding more.');
        const added={id:'journal-'+crypto.randomUUID(),title:entry.title,body:entry.body,
          createdAt:new Date().toISOString()};
        updatedShared=[added,...sharedRows];
        updatedPrivate=[added,...privateRows];
      }else{
        const timestamp=new Date().toISOString(),replacementId='journal-'+crypto.randomUUID();
        const changes={action:operation,entryId:payload?.entryId,
          expected:payload?.expected,draft:payload?.draft,
          replacementId,updatedAt:timestamp};
        // If older copies differ, reject rather than editing the wrong row.
        updatedShared=changeJournalRows(sharedRows,changes);
        updatedPrivate=changeJournalRows(privateRows,changes);
      }
      tx.update(sharedRef(cid,id),{journal:updatedShared});
      tx.update(ownedRef(uid,sourceId),{journal:updatedPrivate});
    });
    same(uid);return {ok:true};
  }
  const addJournalEntry=(cid,id,draft)=>writeJournal(cid,id,'add',draft);
  const updateJournalEntry=(cid,id,change)=>writeJournal(cid,id,'update',change);
  const deleteJournalEntry=(cid,id,change)=>writeJournal(cid,id,'delete',change);


  function galleryStorage(){
    if(!storage||!storageSdk?.ref||!storageSdk?.uploadBytes||
      !storageSdk?.getDownloadURL||!storageSdk?.deleteObject)
      throw Error('Character Gallery storage is unavailable.');
    return storageSdk;
  }
  async function verifiedGallery(cid,id,{editable=false}={}){
    requireDashboardId(cid);requireDashboardId(id);
    const context=await resolveCampaign(cid,id);
    if(!context.relationship.owned)
      throw Error('Only the linked character owner may manage gallery images.');
    const sourceId=context.character.sourceCharacterId||id;
    requireDashboardId(sourceId);
    if(editable){
      const session=await guarded(sessionRef(cid),'Live session is unavailable.');
      same(context.uid);
      if(!session.exists()||gmSessionState(session.data()).editable!==true)
        throw Error('Start an editable campaign session to manage the gallery.');
    }
    return {...context,sourceId};
  }
  async function galleryTransaction(cid,id,operation){
    const {uid}=await verifiedGallery(cid,id,{editable:true});
    let removed=null;
    await firestoreSdk.runTransaction(db,async tx=>{
      const campaignSnap=await tx.get(campaignRef(cid));
      const memberSnap=campaignSnap.exists()&&campaignSnap.data().membershipSchemaVersion===2&&
        campaignSnap.data().ownerUid!==uid?await tx.get(memberRef(cid,uid)):null;
      const characterSnap=await tx.get(sharedRef(cid,id));
      const sourceId=characterSnap.exists()?(characterSnap.data().sourceCharacterId||id):id;
      requireDashboardId(sourceId);
      const privateSnap=await tx.get(ownedRef(uid,sourceId));
      const sessionSnap=await tx.get(sessionRef(cid));
      same(uid);
      if(!campaignSnap.exists()||!characterSnap.exists()||
        !playerCampaignAccess({...campaignSnap.data(),id:cid},
          memberSnap?.exists()?memberSnap.data():null,uid,cid).allowed||
        !linkedCharacterAccess({...campaignSnap.data(),id:cid},
          {...characterSnap.data(),id},uid,{allowed:true,isGM:false}).owned)
        throw Error('Character ownership or campaign access changed.');
      if(!privateSnap.exists()||privateSnap.data().ownerUid!==uid||
        !matchesOwnedSource({...privateSnap.data(),id:sourceId},
          {...characterSnap.data(),id},cid,uid,campaignSnap.data().membershipSchemaVersion??1))
        throw Error('Original saved character link changed.');
      if(!sessionSnap.exists()||gmSessionState(sessionSnap.data()).editable!==true)
        throw Error('Start an editable campaign session to manage the gallery.');
      const shared=characterSnap.data(),owner=privateSnap.data();
      const combined=mergedGalleryRows(shared.gallery,owner.gallery);
      const find=imageId=>combined.find(row=>
        row&&typeof row==='object'&&row.id===imageId);
      let next,portrait=null;
      if(operation.type==='add'){
        if(combined.length>=MAX_GALLERY_IMAGES)
          throw Error('Gallery image limit reached.');
        if(find(operation.image.id))throw Error('Gallery image already exists.');
        next=[...combined,operation.image];
        if(!shared.image&&!shared.portrait&&!owner.image&&!owner.portrait)
          portrait=operation.image.url;
      }else if(operation.type==='portrait'){
        const image=find(operation.imageId);
        if(!image?.url)throw Error('The selected gallery image is unavailable.');
        next=combined;portrait=image.url;
      }else if(operation.type==='delete'){
        const image=find(operation.imageId);
        if(!image)throw Error('Gallery image no longer exists.');
        removed=image;
        next=combined.filter(row=>!(row&&typeof row==='object'&&row.id===operation.imageId));
        if([shared.image,shared.portrait,shared.characterImage,
          owner.image,owner.portrait,owner.characterImage].includes(image.url))
          portrait=next.find(row=>row&&typeof row==='object'&&row.url)?.url||'';
      }else throw Error('Unsupported gallery action.');
      const patch={gallery:next,updatedAt:firestoreSdk.serverTimestamp()};
      if(portrait!==null)Object.assign(patch,{
        image:portrait,portrait,characterImage:portrait
      });
      tx.update(sharedRef(cid,id),patch);
      tx.update(ownedRef(uid,sourceId),patch);
    });
    same(uid);return {ok:true,removed};
  }
  async function uploadGalleryImage(cid,id,file){
    const details=validateGalleryUpload(file);
    const sdk=galleryStorage();
    const {uid,sourceId}=await verifiedGallery(cid,id,{editable:true});
    const imageId='gallery-'+crypto.randomUUID();
    const path=galleryStoragePath(uid,sourceId,imageId,details.extension);
    const reference=sdk.ref(storage,path);
    let uploaded=false,committed=false;
    try{
      await sdk.uploadBytes(reference,file,{contentType:details.type,
        cacheControl:'private,max-age=0,no-store',
        customMetadata:{campaignId:cid,campaignCharacterId:id,sourceCharacterId:sourceId}});
      uploaded=true;same(uid);
      const url=await sdk.getDownloadURL(reference);
      same(uid);
      if(typeof url!=='string'||!(/^(?:https:\/\/|http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/)/.test(url))||
        url.length>2048)throw Error('Firebase returned an invalid gallery image URL.');
      const image={id:imageId,url,path,name:details.name,createdAt:new Date().toISOString()};
      await galleryTransaction(cid,id,{type:'add',image});
      committed=true;
      same(uid);return {ok:true,image};
    }catch(error){
      if(uploaded&&!committed)await sdk.deleteObject(reference).catch(()=>{});
      throw error;
    }
  }
  async function setGalleryPortrait(cid,id,imageId){
    requireDashboardId(imageId);
    return galleryTransaction(cid,id,{type:'portrait',imageId});
  }
  async function deleteGalleryImage(cid,id,imageId){
    requireDashboardId(imageId);
    const sdk=galleryStorage(),context=await verifiedGallery(cid,id,{editable:true});
    const result=await galleryTransaction(cid,id,{type:'delete',imageId});
    const path=result.removed?.path;
    if(path){
      // An old gallery may contain external or migrated paths. Never delete
      // unrelated Storage objects based on untrusted saved metadata.
      try{
        assertOwnedGalleryPath(path,context.uid,context.sourceId);
        await sdk.deleteObject(sdk.ref(storage,path));
      }catch(error){
        if(error?.code!=='storage/object-not-found')return {ok:true,storageCleanupPending:true};
      }
    }
    return {ok:true};
  }
  async function refreshGalleryImage(cid,id,imageId){
    requireDashboardId(imageId);
    const sdk=galleryStorage(),context=await verifiedGallery(cid,id);
    const rows=mergedGalleryRows(context.character.gallery,context.source?.gallery);
    const image=rows.find(row=>row&&typeof row==='object'&&row.id===imageId);
    if(!image)throw Error('Gallery image is no longer available.');
    if(!image.path){
      if(typeof image.url==='string'&&image.url.startsWith('https://'))
        return {ok:true,url:image.url};
      throw Error('The original image must be uploaded again.');
    }
    const path=assertOwnedGalleryPath(image.path,context.uid,context.sourceId);
    const url=await sdk.getDownloadURL(sdk.ref(storage,path));
    same(context.uid);
    if(typeof url!=='string'||url.length>2048)throw Error('Gallery image URL is invalid.');
    return {ok:true,url};
  }


  /** Player-visible information comes only from the public party-workspace
   * document. Event history is restricted to the verified character owner.
   * Membership and character listeners revoke the feed immediately. */
  function watchInformation(cid,id,onUpdate,onError){
    requireDashboardId(cid);requireDashboardId(id);
    let active=true;const stops=[];const state={
      campaign:null,member:null,character:null,source:null,
      party:null,events:[],owner:false
    };
    let ready={campaign:false,member:false,character:false,source:false,
      party:false,events:false};
    const close=()=>{active=false;while(stops.length)try{stops.pop()();}catch{}};
    const fail=error=>{if(!active)return;close();onError?.(error instanceof Error?
      error:Error('Campaign information is unavailable.'));};
    (async()=>{
      try{
        const initial=await resolveCampaign(cid,id);
        if(!active)return;
        const {uid,usesMember,relationship}=initial;
        state.owner=relationship.owned;
        ready.member=!usesMember;
        ready.source=!relationship.owned;
        ready.events=!relationship.owned;
        const publish=()=>{
          if(!active||!Object.values(ready).every(Boolean))return;
          try{
            same(uid);
            const access=playerCampaignAccess(state.campaign,state.member,uid,cid);
            const linked=linkedCharacterAccess(state.campaign,state.character,uid,access);
            if(!linked.allowed||linked.owned!==state.owner)
              throw Error('Campaign information access changed.');
            if(linked.owned&&!matchesOwnedSource(state.source,state.character,cid,uid,
              state.campaign.membershipSchemaVersion??1))
              throw Error('Saved character link changed.');
            onUpdate?.(Object.freeze({
              published:publishedInformation(state.party||{}),
              events:linked.owned?scopedEventProjection(state.events,uid,id):Object.freeze([]),
              owner:linked.owned
            }));
          }catch(error){fail(error);}
        };
        const attach=(key,reference,decode,{optional=false}={})=>{
          const stop=firestoreSdk.onSnapshot(reference,{includeMetadataChanges:true},snapshot=>{
            if(!active||snapshot.metadata?.fromCache||snapshot.metadata?.hasPendingWrites)return;
            try{
              same(uid);
              if(!optional&&!snapshot.exists())throw Error('Campaign information access was revoked.');
              state[key]=snapshot.exists()?decode(snapshot):null;
              ready[key]=true;publish();
            }catch(error){fail(error);}
          },fail);
          if(active)stops.push(stop);else stop();
        };
        attach('campaign',campaignRef(cid),snap=>({...snap.data(),id:snap.id}));
        if(usesMember)attach('member',memberRef(cid,uid),snap=>snap.data());
        attach('character',sharedRef(cid,id),snap=>({...snap.data(),id:snap.id}));
        if(relationship.owned){
          const sourceId=initial.character.sourceCharacterId||id;
          attach('source',ownedRef(uid,sourceId),snap=>({...snap.data(),id:snap.id}));
        }
        attach('party',firestoreSdk.doc(db,'campaigns',cid,'systems','party-workspace'),
          snap=>snap.data(),{optional:true});
        if(relationship.owned){
          const query=firestoreSdk.query(
            firestoreSdk.collection(db,'campaigns',cid,'events'),
            firestoreSdk.where('targetOwnerUid','==',uid),
            firestoreSdk.orderBy('createdAt','desc'),firestoreSdk.limit(100));
          const stop=firestoreSdk.onSnapshot(query,{includeMetadataChanges:true},snap=>{
            if(!active||snap.metadata?.fromCache||snap.metadata?.hasPendingWrites)return;
            try{
              same(uid);state.events=snap.docs.map(row=>({...row.data(),id:row.id}));
              ready.events=true;publish();
            }catch(error){fail(error);}
          },fail);
          if(active)stops.push(stop);else stop();
        }
      }catch(error){fail(error);}
    })();
    return close;
  }
  async function fetchInformationHistory(cid,id,beforeId=''){
    requireDashboardId(cid);requireDashboardId(id);
    if(beforeId!==''&&(typeof beforeId!=='string'||!DASHBOARD_ID.test(beforeId)))
      throw Error('Invalid notification page cursor.');
    const {uid,relationship}=await resolveCampaign(cid,id);
    if(!relationship.owned)throw Error('Only the character owner may view notification history.');
    const constraints=[firestoreSdk.where('targetOwnerUid','==',uid),
      firestoreSdk.orderBy('createdAt','desc')];
    if(beforeId){
      const cursor=await guarded(firestoreSdk.doc(db,'campaigns',cid,'events',beforeId),
        'Notification page is unavailable.');
      same(uid);
      if(!cursor.exists()||cursor.data().targetOwnerUid!==uid||
        cursor.data().targetCharacterId!==id)
        throw Error('Invalid notification page cursor.');
      constraints.push(firestoreSdk.startAfter(cursor));
    }
    constraints.push(firestoreSdk.limit(100));
    const snap=await firestoreSdk.getDocs(firestoreSdk.query(
      firestoreSdk.collection(db,'campaigns',cid,'events'),...constraints));
    same(uid);
    const raw=snap.docs.map(row=>({...row.data(),id:row.id}));
    return Object.freeze({
      events:scopedEventProjection(raw,uid,id),
      cursor:snap.docs.length===100?snap.docs.at(-1).id:'',
      more:snap.docs.length===100
    });
  }
  async function markInformationRead(cid,id,source,noticeId,read){
    requireDashboardId(cid);requireDashboardId(id);
    const input=assertNoticeAction(source,noticeId,read);
    if(!functions||!functionsSdk?.httpsCallable)
      throw Error('Notification read actions are unavailable.');
    const {uid,relationship}=await resolveCampaign(cid,id);
    if(!relationship.owned)throw Error('Only the character owner can change notification state.');
    const callable=functionsSdk.httpsCallable(functions,'asteriaAction');
    const result=await callable({action:'markNotificationRead',
      args:[cid,id,input.source,input.id,input.read],
      requestId:crypto.randomUUID()});
    same(uid);
    if(result.data?.ok!==true)throw Error(result.data?.error||'Notification could not be updated.');
    return result.data;
  }
  return Object.freeze({availability:()=>flags,watchOwned,watchCampaign,
    saveOwnedLayout,saveCampaignLayout,adjustResource,removeCondition,
    takeRest,adjustCurrency,useQuickItem,castSpell,
    addJournalEntry,updateJournalEntry,deleteJournalEntry,
    uploadGalleryImage,setGalleryPortrait,deleteGalleryImage,refreshGalleryImage,
    updateQuestStatus,updateQuestProgress,
    watchInformation,fetchInformationHistory,markInformationRead});
}
