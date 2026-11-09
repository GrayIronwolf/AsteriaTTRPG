import {createHash} from 'node:crypto';
import {legacyMembershipPlan,memberDocument} from './campaignMembership.mjs';

// Phase 8.2: admin-only, dry-run-first rehearsal of existing legacy data.
// There is deliberately NO callable, production migrator, schema cutover,
// deletion, live character-sheet update, or automatic background job.
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const UCN=/^\d{12}$/;
const MAX_MEMBERS=100;
const MAX_CHARACTERS=80;
const HOST=/^(?:localhost|127\.0\.0\.1|\[::1\]):\d{2,5}$/;
const validId=value=>typeof value==='string'&&ID.test(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function issueSummary(items){
  const counts=new Map();
  for(const code of items)counts.set(code,(counts.get(code)||0)+1);
  return [...counts].sort(([a],[b])=>a.localeCompare(b))
    .map(([code,count])=>({code,count}));
}
function memberMatches(actual,expected,campaignId){
  return object(actual)&&actual.uid===expected.uid&&
    actual.campaignId===campaignId&&actual.role===expected.role&&
    actual.status===expected.status&&Number.isSafeInteger(actual.revision)&&
    actual.revision>=1;
}
function linkMatches(link,key,expected){
  return object(link)&&object(key)&&
    link.linkId===expected.digest&&key.linkId===expected.digest&&
    link.campaignId===expected.campaignId&&key.campaignId===expected.campaignId&&
    link.ownerUid===expected.ownerUid&&key.ownerUid===expected.ownerUid&&
    link.sourceCharacterId===expected.sourceCharacterId&&
    key.sourceCharacterId===expected.sourceCharacterId&&
    link.campaignCharacterId===expected.campaignCharacterId&&
    key.campaignCharacterId===expected.campaignCharacterId&&
    link.status==='approved'&&Number.isSafeInteger(link.revision)&&
    link.revision>=1;
}
function sourceMatches(sheet,expected){
  return object(sheet)&&sheet.ownerUid===expected.ownerUid&&
    (sheet.id===undefined||sheet.id===expected.sourceCharacterId)&&
    (sheet.sourceCharacterId===undefined||
      sheet.sourceCharacterId===expected.sourceCharacterId)&&
    (!sheet.sharedCampaignId||sheet.sharedCampaignId===expected.campaignId)&&
    (!object(sheet.campaignCharacterIds)||
      !sheet.campaignCharacterIds[expected.campaignId]||
      sheet.campaignCharacterIds[expected.campaignId]===expected.campaignCharacterId);
}
export function assertDemoMigrationTarget(db,host=process.env.FIRESTORE_EMULATOR_HOST){
  // Firebase Admin Firestore exposes the configured project through
  // _settings, whereas the isolated unit fixture has an app.options shape.
  // Unknown projects fail closed. FIRESTORE_EMULATOR_HOST must be local.
  const projectId=db?._settings?.projectId??db?.app?.options?.projectId;
  if(projectId!=='demo-asteria'||!HOST.test(host||'')){
    throw Error('Phase 8.2 writes are restricted to the demo-asteria Firestore emulator.');
  }
}
async function collectionRows(tx,db,path,cap,issues,code){
  const snapshot=await tx.get(db.collection(path).limit(cap+1));
  if(snapshot.docs.length>cap)issues.push(code);
  return snapshot.docs.slice(0,cap);
}
/**
 * Reconcile the canonical membership, UCN directory and legacy character
 * ownership without trusting local account copies, display names or UCNs as
 * access credentials. Reports expose only counts/error codes, never accounts,
 * character sheets, player email addresses, tokens or invitation secrets.
 *
 * stage=false: read-only against any DB (owner UID still enforced).
 * stage=true: emulator-only, create missing records inside one transaction.
 * Existing records, gameplay, shared sheets, private sheets, legacy invite
 * status, campaign role arrays and schema version are NEVER changed.
 */
export async function rehearseLegacyCampaignMigration(db,actorUid,campaignId,{
  stage=false,now=new Date()
}={}){
  if(!validId(actorUid)||!validId(campaignId)||typeof stage!=='boolean')
    throw Error('Invalid migration rehearsal request.');
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error('Invalid migration timestamp.');
  if(stage)assertDemoMigrationTarget(db);
  return db.runTransaction(async tx=>{
    const prefix='campaigns/'+campaignId;
    const campaignRef=db.doc(prefix);
    const campaignSnap=await tx.get(campaignRef);
    if(!campaignSnap.exists)throw Error('Campaign not found.');
    const campaign=campaignSnap.data();
    if(!object(campaign)||campaign.ownerUid!==actorUid)
      throw Error('Only the verified campaign owner may audit this migration.');
    const problems=[],warnings=[];
    if(campaign.membershipSchemaVersion===2)
      problems.push('campaign-already-v2');
    else if(![undefined,null,1].includes(campaign.membershipSchemaVersion))
      problems.push('unknown-schema-version');
    if(campaign.id&&campaign.id!==campaignId)
      problems.push('campaign-identity-conflict');
    let legacy={rows:[],issues:[]};
    if(!problems.includes('campaign-already-v2')&&
      !problems.includes('unknown-schema-version')){
      try{legacy=legacyMembershipPlan(campaign,campaignId);}
      catch{problems.push('invalid-legacy-membership');}
    }
    problems.push(...legacy.issues.map(row=>row.code));
    const memberRows=await collectionRows(tx,db,prefix+'/members',
      MAX_MEMBERS,problems,'too-many-canonical-members');
    const memberById=new Map(memberRows.map(row=>[row.id,row.data()]));
    const plannedMembers=[];
    const expectedMembers=new Set(legacy.rows.map(row=>row.uid));
    for(const row of legacy.rows){
      if(!memberById.has(row.uid))plannedMembers.push(row);
      else if(!memberMatches(memberById.get(row.uid),row,campaignId))
        problems.push('staged-member-conflict');
    }
    for(const row of memberRows)
      if(!expectedMembers.has(row.id))problems.push('unexpected-canonical-member');

    let plannedDirectory=null;
    const ucn=campaign.ucn;
    if(!UCN.test(ucn))problems.push('invalid-campaign-ucn');
    if(UCN.test(ucn)){
      const directoryRef=db.doc('campaignDirectory/'+ucn);
      const inviteRef=db.doc('campaignInvites/'+ucn);
      const [directorySnap,inviteSnap]=await Promise.all([
        tx.get(directoryRef),tx.get(inviteRef)
      ]);
      const directory=directorySnap.exists?directorySnap.data():null;
      const invite=inviteSnap.exists?inviteSnap.data():null;
      if(directory){
        if(directory.campaignId!==campaignId||directory.ownerUid!==actorUid||
          directory.status!=='active'||
          (directory.ucn!==undefined&&directory.ucn!==ucn))
          problems.push('directory-identity-or-status-conflict');
      }else if(!invite||invite.campaignId!==campaignId||
        invite.ownerUid!==actorUid||invite.status!=='active'||
        (invite.ucn!==undefined&&invite.ucn!==ucn)){
        problems.push('missing-verified-ucn-directory');
      }else{
        plannedDirectory={ref:directoryRef,data:{
          ucn,campaignId,ownerUid:actorUid,status:'active',
          createdAt:now,updatedAt:now
        }};
      }
      if(invite&&(invite.campaignId!==campaignId||invite.ownerUid!==actorUid))
        problems.push('legacy-invite-identity-conflict');
      if(invite&&invite.status!=='active')
        warnings.push('legacy-invitation-inactive');
    }
    // Historical recipient email records remain on the member-readable v1
    // campaign root. Never copy them into new membership or report fields.
    if(campaign.invites!==undefined&&campaign.invites!==null){
      if(!Array.isArray(campaign.invites))problems.push('legacy-invites-malformed');
      else if(campaign.invites.some(row=>object(row)&&(
        row.email||row.recipientEmail||row.recipientEmailNormalized||
        row.token||row.tokenDigest)))
        warnings.push('legacy-private-invites-require-review');
    }

    const sharedRows=await collectionRows(tx,db,prefix+'/characters',
      MAX_CHARACTERS,problems,'too-many-shared-characters');
    const linkRows=await collectionRows(tx,db,prefix+'/characterLinks',
      MAX_CHARACTERS,problems,'too-many-existing-character-links');
    const keyRows=await collectionRows(tx,db,prefix+'/characterLinkKeys',
      MAX_CHARACTERS,problems,'too-many-existing-link-keys');
    const sharedById=new Map(sharedRows.map(row=>[row.id,row.data()]));
    const linkById=new Map(linkRows.map(row=>[row.id,row.data()]));
    const keyById=new Map(keyRows.map(row=>[row.id,row.data()]));
    const oldOwners=object(campaign.playerCharacterLinks)?
      campaign.playerCharacterLinks:{};
    const summaries=object(campaign.characters)?campaign.characters:{};
    if(campaign.playerCharacterLinks!==undefined&&
      !object(campaign.playerCharacterLinks))
      problems.push('invalid-legacy-character-owners');
    if(campaign.characters!==undefined&&!object(campaign.characters))
      problems.push('invalid-legacy-character-summaries');
    if(campaign.party!==undefined&&!Array.isArray(campaign.party))
      problems.push('invalid-party-index');
    if(campaign.players!==undefined&&!object(campaign.players))
      problems.push('invalid-player-roster');
    const all=new Set([
      ...Object.keys(oldOwners),...Object.keys(summaries),
      ...(Array.isArray(campaign.party)?campaign.party:[]),
      ...sharedById.keys()
    ]);
    for(const row of Object.values(object(campaign.players)?campaign.players:{})){
      if(!object(row))continue;
      if(row.characterIds!==undefined&&!Array.isArray(row.characterIds)){
        problems.push('invalid-player-character-index');
        continue;
      }
      for(const id of row.characterIds||[])all.add(id);
    }
    if(all.size>MAX_CHARACTERS)problems.push('too-many-legacy-character-links');
    const memberMap=new Map(legacy.rows.map(row=>[row.uid,row]));
    const candidates=[],digests=new Map();
    for(const characterId of [...all].slice(0,MAX_CHARACTERS)){
      if(!validId(characterId)){
        problems.push('invalid-shared-character-id');continue;
      }
      const ownerUid=oldOwners[characterId];
      const shared=sharedById.get(characterId);
      const summary=summaries[characterId];
      if(!validId(ownerUid)||!object(shared)){
        problems.push(!validId(ownerUid)?
          'missing-verified-character-owner':'missing-shared-gameplay-character');
        continue;
      }
      if(shared.ownerUid!==ownerUid||
        (shared.id!==undefined&&shared.id!==characterId)||
        (object(summary)&&summary.ownerUid!==undefined&&
          summary.ownerUid!==ownerUid)){
        problems.push('legacy-character-ownership-conflict');continue;
      }
      if(memberMap.get(ownerUid)?.status!=='active'){
        problems.push('inactive-or-unlisted-character-owner');continue;
      }
      const explicit=[summary?.sourceCharacterId,shared.sourceCharacterId]
        .filter(v=>v!==undefined&&v!==null);
      if(explicit.length>1&&explicit[0]!==explicit[1]){
        problems.push('character-source-identity-conflict');continue;
      }
      const sourceCharacterId=explicit[0]||characterId;
      if(!validId(sourceCharacterId)){
        problems.push('invalid-source-character-id');continue;
      }
      const digest=createHash('sha256')
        .update(ownerUid+'\0'+sourceCharacterId).digest('hex');
      if(digests.has(digest)&&digests.get(digest)!==characterId){
        problems.push('duplicate-owner-source-character');continue;
      }
      digests.set(digest,characterId);
      candidates.push({digest,campaignId,ownerUid,sourceCharacterId,
        campaignCharacterId:characterId});
    }
    const sheetSnapshots=await Promise.all(candidates.map(row=>
      tx.get(db.doc('users/'+row.ownerUid+'/characters/'+row.sourceCharacterId))
    ));
    const plannedLinks=[];
    let unmappedPrivateSheets=0;
    for(let i=0;i<candidates.length;i++){
      const row=candidates[i];
      const sheet=sheetSnapshots[i].exists?sheetSnapshots[i].data():null;
      if(!sourceMatches(sheet,row)){
        problems.push('private-character-identity-or-map-conflict');
        continue;
      }
      if(!sheet.campaignCharacterIds?.[campaignId]){
        unmappedPrivateSheets++;
        warnings.push('private-character-mapping-requires-review');
      }
      const link=linkById.get(row.digest),key=keyById.get(row.digest);
      if(Boolean(link)!==Boolean(key)){
        problems.push('partial-character-reservation');continue;
      }
      if(link){
        if(!linkMatches(link,key,row))
          problems.push('canonical-character-link-conflict');
      }else plannedLinks.push(row);
    }
    const expectedDigests=new Set(candidates.map(row=>row.digest));
    for(const row of linkRows)
      if(!expectedDigests.has(row.id))problems.push('unexpected-canonical-link');
    for(const row of keyRows)
      if(!expectedDigests.has(row.id))problems.push('unexpected-character-reservation');

    const report={
      campaignId,mode:stage?'emulator-stage':'dry-run',
      readyToStage:problems.length===0,
      readyForActivation:problems.length===0&&warnings.length===0&&
        plannedMembers.length===0&&plannedLinks.length===0&&!plannedDirectory,
      members:{total:legacy.rows.length,missing:plannedMembers.length},
      characters:{total:all.size,verified:candidates.length,
        missingCanonicalLinks:plannedLinks.length,
        privateMappingsToReview:unmappedPrivateSheets},
      directory:{missing:Boolean(plannedDirectory)},
      issues:issueSummary(problems),
      warnings:issueSummary(warnings),
      staged:{members:0,links:0,reservations:0,directory:0}
    };
    if(!stage)return report;
    if(problems.length||warnings.length)throw Error('Migration rehearsal blocked; resolve audit issues and privacy/mapping warnings first.');
    // All reads above precede all writes; never update or overwrite anything.
    for(const row of plannedMembers){
      tx.create(db.doc(prefix+'/members/'+row.uid),memberDocument({
        campaignId,uid:row.uid,role:row.role,status:row.status,
        joinedAt:row.joinedAt,origin:'legacy-migration'
      },now));
    }
    if(plannedDirectory)tx.create(plannedDirectory.ref,plannedDirectory.data);
    for(const row of plannedLinks){
      tx.create(db.doc(prefix+'/characterLinks/'+row.digest),{
        linkId:row.digest,campaignId,
        ownerUid:row.ownerUid,sourceCharacterId:row.sourceCharacterId,
        campaignCharacterId:row.campaignCharacterId,status:'approved',
        role:'player-character',origin:'legacy-migration',
        sourceKind:'owned',revision:1,requestedAt:now,updatedAt:now,
        approvedAt:null,approvedByUid:null
      });
      tx.create(db.doc(prefix+'/characterLinkKeys/'+row.digest),{
        linkId:row.digest,campaignId,
        ownerUid:row.ownerUid,sourceCharacterId:row.sourceCharacterId,
        campaignCharacterId:row.campaignCharacterId,createdAt:now
      });
    }
    return {...report,staged:{
      members:plannedMembers.length,links:plannedLinks.length,
      reservations:plannedLinks.length,directory:Number(Boolean(plannedDirectory))
    }};
  });
}
