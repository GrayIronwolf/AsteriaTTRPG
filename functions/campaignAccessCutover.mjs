import {legacyMembershipPlan} from './campaignMembership.mjs';
const ID=/^[A-Za-z0-9_-]{1,160}$/;

/**
 * Versioned campaign permission migration. Admin SDK only, user must be owner.
 * Readiness is assessed without writes by default. A separately deployed
 * server flag must be enabled to allow the activate operation.
 *
 * All staged records must be complete and agree with the original roster.
 * Existing inactive records are never overwritten or downgraded to active.
 * Cutover writes projections first and marks version=2 atomically in one
 * Firestore transaction, so rules never observe a half-migrated campaign.
 */
export async function prepareCampaignCutover(db,actorUid,campaignId,{activate=false,now=new Date()}={}) {
  if(typeof actorUid!=='string'||!ID.test(actorUid)||typeof campaignId!=='string'||!ID.test(campaignId)) throw new Error('Invalid campaign authorization.');
  return db.runTransaction(async tx=>{
    const campaignRef=db.doc('campaigns/'+campaignId);
    const snap=await tx.get(campaignRef);
    if(!snap.exists) throw new Error('Campaign not found.');
    const campaign=snap.data();
    if(campaign.ownerUid!==actorUid) throw new Error('Only the campaign owner can activate membership access.');
    if(campaign.membershipSchemaVersion===2) {
      if(activate) throw new Error('Campaign is already using v2 membership.');
      return {campaignId,ready:false,alreadyActive:true,issues:[{code:'already-active'}]};
    }
    const plan=legacyMembershipPlan(campaign,campaignId);
    const issues=[...plan.issues];
    const refs=plan.rows.map(row=>db.doc('campaigns/'+campaignId+'/members/'+row.uid));
    const memberSnaps=await Promise.all(refs.map(ref=>tx.get(ref)));
    const activeMembers=[];
    for(let i=0;i<plan.rows.length;i++) {
      const row=plan.rows[i],doc=memberSnaps[i];
      if(!doc.exists){issues.push({code:'unstaged-member',uid:row.uid});continue;}
      const member=doc.data();
      if(member.uid!==row.uid || member.campaignId!==campaignId || member.role!==row.role || member.status!==row.status || 
         !Number.isSafeInteger(member.revision) || member.revision<1) {
        issues.push({code:'membership-conflict',uid:row.uid});continue;
      }
      if(member.status==='active') activeMembers.push(row);
    }
    if(!plan.rows.some(row=>row.uid===actorUid&&row.role==='owner'&&row.status==='active')) issues.push({code:'missing-owner'});
    // Prevent user-by-user staging from silently missing old membership rows.
    const memberDirectory=await tx.get(db.doc('campaigns/'+campaignId+'/membershipReadiness/validation'));
    if(memberDirectory.exists) issues.push({code:'unexpected-readiness-sentinel'});
    const result={campaignId,ready:issues.length===0,issues,activeMembers:activeMembers.length,totalMembers:plan.rows.length,legacyVersion:campaign.membershipSchemaVersion??1};
    if(!activate) return result;
    if(issues.length) throw new Error('Campaign membership migration has unresolved conflicts.');
    for(const row of plan.rows) {
      const projectionRef=db.doc('campaignMemberProjections/'+row.uid+'/campaigns/'+campaignId);
      tx.set(projectionRef,{
        campaignId,role:row.role,status:row.status,
        displayNameSnapshot:String(campaign.name||'Campaign').slice(0,120),updatedAt:now
      });
    }
    tx.update(campaignRef,{membershipSchemaVersion:2,membershipRevision:1});
    return {...result,activated:true};
  });
}
