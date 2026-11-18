import {
  campaignIdentity,campaignEditablePatch,campaignSummary,editCampaignDraft,
  CAMPAIGN_ID,UCN
} from './campaignForgeModel.mjs';
import {timestampValue} from '../../../src/state/characterIntegrityModel.mjs';

/**
 * Reuses the existing Auth, Firestore and globally unique UCN callable.
 * No local owner claims, guessed identifiers, or client-assigned UCNs.
 */
export function createFirebaseCampaignsService({
  auth,db,firestoreSdk,functions,functionsSdk,readCanonical,enabled=false
}){
  if(!auth||!db||!firestoreSdk||!functions||!functionsSdk||
    typeof readCanonical!=='function')throw new Error('Asteria Firebase services required.');
  const flags=Object.freeze({enabled:enabled===true});
  const same=uid=>{
    if(auth.currentUser?.uid!==uid)throw new Error('Account changed during campaign operation.');
  };
  async function owner(){
    if(!flags.enabled)throw new Error('Campaign Forge is not enabled.');
    const user=auth.currentUser;
    if(!user?.uid)throw new Error('Sign in to manage campaigns.');
    const profile=await readCanonical(user);
    if(!profile||profile.uid!==user.uid||auth.currentUser?.uid!==user.uid)
      throw new Error('Account profile could not be verified.');
    return user.uid;
  }
  const ref=id=>firestoreSdk.doc(db,'campaigns',id);
  async function load(id){
    const uid=await owner();
    if(typeof id!=='string'||!CAMPAIGN_ID.test(id))throw new Error('Invalid campaign ID.');
    const snap=await firestoreSdk.getDocFromServer(ref(id));
    same(uid);
    if(!snap.exists())throw new Error('Campaign no longer exists.');
    const campaign={...snap.data(),id:snap.id};
    // The owner must be verified from the fresh server source; never from a
    // private mirror which might be stale, or from a URL role parameter.
    if(campaign.ownerUid!==uid)throw new Error('Only the campaign owner may change settings.');
    if(!UCN.test(String(campaign.ucn||'')))
      throw new Error('The campaign needs a verified server-issued UCN.');
    return campaign;
  }
  async function list(){
    const uid=await owner();
    const query=firestoreSdk.query(firestoreSdk.collection(db,'campaigns'),
      firestoreSdk.where('ownerUid','==',uid));
    const snapshot=await firestoreSdk.getDocsFromServer(query);
    same(uid);
    const items=[],excluded=[];
    for(const doc of snapshot.docs){
      const raw={...doc.data(),id:doc.id};
      if(raw.ownerUid!==uid||!UCN.test(String(raw.ucn||''))){
        excluded.push(doc.id);continue;
      }
      items.push(campaignSummary(raw,uid));
    }
    return {items:items.sort((a,b)=>a.name.localeCompare(b.name)),excluded:excluded.length};
  }
  async function save(id,draft,expectedUpdatedAt=null){
    const uid=await owner();
    const campaign=await load(id);
    same(uid);
    const patch=campaignEditablePatch(draft,campaign);
    const result=await firestoreSdk.runTransaction(db,async transaction=>{
      const fresh=await transaction.get(ref(id));
      same(uid);
      if(!fresh.exists())throw new Error('Campaign no longer exists.');
      const current={...fresh.data(),id:fresh.id};
      if(current.ownerUid!==uid||current.ucn!==campaign.ucn||
         current.membershipSchemaVersion!==campaign.membershipSchemaVersion)
        throw new Error('Campaign ownership or membership changed. Reload the campaign.');
      // Compare the editor's original revision against the current server.
      // Old records may have either a Timestamp or an ISO date.
      if(timestampValue(current.updatedAt)!==timestampValue(expectedUpdatedAt))
        throw new Error('Campaign changed in another session. Reload before saving.');
      const approved=campaignEditablePatch(draft,current);
      transaction.update(ref(id),{...approved,updatedAt:firestoreSdk.serverTimestamp()});
      return {id,updated:true};
    });
    same(uid);
    return result;
  }
  async function create(draft){
    const uid=await owner();
    // Validate all fields BEFORE allocating an irreversible campaign UCN.
    const {validateCampaignDraft}=await import('./campaignForgeModel.mjs');
    const problems=validateCampaignDraft(draft);
    if(problems.length)throw new Error(problems[0].message);
    // Always request legacy-compatible creation. v2 activation is deliberately
    // out of scope until invitation and membership migration in Phase 5.3.
    const allocate=functionsSdk.httpsCallable(functions,'asteriaCampaignUCN');
    const response=await allocate({action:'create',name:draft.name.trim()});
    same(uid);
    const identity=campaignIdentity(response?.data,uid);
    // Identity allocation is committed server-side before the descriptive
    // profile is saved. If this later write fails, the verified owner query
    // rediscoveres the campaign for recovery; never allocate a second UCN
    // silently or claim the entire creation was rolled back.
    const current=await load(identity.id);
    same(uid);
    const patch=campaignEditablePatch(draft,current);
    await firestoreSdk.runTransaction(db,async transaction=>{
      const snap=await transaction.get(ref(identity.id));
      same(uid);
      if(!snap.exists()||snap.data().ownerUid!==uid||
         snap.data().ucn!==identity.ucn)throw new Error('Campaign identity changed.');
      const existing={...snap.data(),id:snap.id};
      const approved=campaignEditablePatch(draft,existing);
      transaction.update(ref(identity.id),{
        ...approved,updatedAt:firestoreSdk.serverTimestamp()
      });
    });
    same(uid);
    return load(identity.id);
  }
  return Object.freeze({availability:()=>flags,list,load,create,save,
    editDraft:editCampaignDraft});
}
