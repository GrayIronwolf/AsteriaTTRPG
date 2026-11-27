/** Campaign session attendance, deliberately independent of membership, online
 * presence, combat participants and second-screen permission.
 * GM-only callable writes; no client Firestore write permission is needed.
 */
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const validId=value=>typeof value==='string'&&ID.test(value)&&
  !['__proto__','constructor','prototype'].includes(value);
export const ATTENDANCE_VALUES=Object.freeze([
  'not-participating','in-person','remote'
]);
const validValue=value=>ATTENDANCE_VALUES.includes(value);
const validRevision=value=>Number.isSafeInteger(value)&&value>=0&&value<1000000;
const statusOf=value=>validValue(value)?value:'not-participating';
export function attendanceSummary(record){
  if(!record||!validId(record.uid))return null;
  return {uid:record.uid,mode:statusOf(record.mode),
    revision:validRevision(record.revision)?record.revision:0,
    updatedAt:record.updatedAt instanceof Date?record.updatedAt.toISOString():
      typeof record.updatedAt?.toDate==='function'?
        record.updatedAt.toDate().toISOString():null};
}
export function validateAttendanceInput(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(key=>![
      'campaignId','memberUid','mode','expectedRevision'
    ].includes(key))||!validId(input.campaignId)||!validId(input.memberUid)||
    !validValue(input.mode)||!validRevision(input.expectedRevision))
    throw Error('Attendance change has invalid member, mode or revision.');
  return input;
}
export async function updateCampaignAttendance(db,actorUid,input){
  validateAttendanceInput(input);
  if(!validId(actorUid))throw Error('Campaign GM sign-in required.');
  const {campaignId,memberUid,mode,expectedRevision}=input;
  const campaignRef=db.doc('campaigns/'+campaignId);
  const actorRef=db.doc('campaigns/'+campaignId+'/members/'+actorUid);
  const memberRef=db.doc('campaigns/'+campaignId+'/members/'+memberUid);
  const attendanceRef=db.doc('campaigns/'+campaignId+'/attendance/'+memberUid);
  return db.runTransaction(async tx=>{
    const campaignSnap=await tx.get(campaignRef);
    if(!campaignSnap.exists)throw Error('Campaign not found.');
    const campaign=campaignSnap.data()||{};
    if(campaign.membershipSchemaVersion!==2||!validId(campaign.ownerUid))
      throw Error('Canonical campaign membership required for attendance.');
    const actorSnap=await tx.get(actorRef);
    const memberSnap=await tx.get(memberRef);
    const previousSnap=await tx.get(attendanceRef);
    const actor=actorSnap.exists?actorSnap.data():null;
    const owner=actorUid===campaign.ownerUid;
    if(!owner&&(!actor||actor.uid!==actorUid||
      actor.campaignId!==campaignId||actor.role!=='co-gm'||actor.status!=='active'))
      throw Error('Only an active campaign GM may manage attendance.');
    const member=memberSnap.exists?memberSnap.data():null;
    if(!member||member.uid!==memberUid||member.campaignId!==campaignId||
      member.role!=='player'||member.status!=='active')
      throw Error('Only an active campaign player may be assigned attendance.');
    const previous=previousSnap.exists?previousSnap.data():null;
    if(previous&&(previous.uid!==memberUid||
      !validRevision(previous.revision)||!validValue(previous.mode)))
      throw Error('Attendance record requires GM review.');
    const revision=previous?.revision||0;
    if(revision!==expectedRevision)
      throw Error('Attendance changed. Refresh the player roster before retrying.');
    const next={uid:memberUid,campaignId,mode,revision:revision+1,
      updatedBy:actorUid,updatedAt:new Date()};
    tx.set(attendanceRef,next);
    return {campaignId,...attendanceSummary(next)};
  });
}

export async function listCampaignAttendance(db,actorUid,campaignId){
  if(!validId(actorUid)||!validId(campaignId))
    throw Error('Campaign GM sign-in required.');
  const snap=await db.doc('campaigns/'+campaignId).get();
  if(!snap.exists)throw Error('Campaign not found.');
  const campaign=snap.data()||{};
  if(campaign.membershipSchemaVersion!==2||!validId(campaign.ownerUid))
    throw Error('Canonical campaign membership required for attendance.');
  if(actorUid!==campaign.ownerUid){
    const actorSnap=await db.doc('campaigns/'+campaignId+'/members/'+actorUid).get();
    const actor=actorSnap.exists?actorSnap.data():null;
    if(!actor||actor.uid!==actorUid||actor.campaignId!==campaignId||
      actor.role!=='co-gm'||actor.status!=='active')
      throw Error('Only an active campaign GM may read attendance.');
  }
  const [members,attendance]=await Promise.all([
    db.collection('campaigns/'+campaignId+'/members').limit(101).get(),
    db.collection('campaigns/'+campaignId+'/attendance').limit(101).get()
  ]);
  if(members.size>100||attendance.size>100)throw Error('Attendance roster exceeds supported size.');
  const eligible=new Set();
  for(const row of members.docs){
    const item=row.data();
    if(item.uid!==row.id||item.campaignId!==campaignId)
      throw Error('Campaign membership requires review.');
    if(item.role==='player'&&item.status==='active'&&validId(row.id))
      eligible.add(row.id);
  }
  const entries=[];
  const seen=new Set();
  for(const row of attendance.docs){
    const item=row.data();
    if(!validId(row.id)||!item||item.uid!==row.id||
      item.campaignId!==campaignId||!validRevision(item.revision)||
      !validValue(item.mode)||seen.has(row.id))
      throw Error('Attendance records require review.');
    seen.add(row.id);
    if(eligible.has(row.id))entries.push(attendanceSummary(item));
  }
  return {campaignId,entries};
}
