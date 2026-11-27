/**
 * GM read-only account and verified character summary.
 * v2 derives roles exclusively from canonical membership documents.
 * No client-side summary grants any permissions.
 */
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const isId=value=>typeof value==='string'&&ID.test(value);
const map=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const safeName=value=>typeof value==='string'?value.trim().slice(0,100):'';
const validStatus=value=>['active','suspended','removed','banned'].includes(value);
const validRole=value=>['owner','co-gm','player'].includes(value);

function legacyMembers(campaign,issues){
  const users=new Map();
  const add=(uid,role)=>{
    if(!isId(uid)){issues.push('invalid-uid');return;}
    if(uid===campaign.ownerUid)role='owner';
    const current=users.get(uid);
    if(current?.role==='owner'||current?.role==='co-gm')role=current.role;
    users.set(uid,{uid,role,status:current?.status||'active'});
  };
  add(campaign.ownerUid,'owner');
  for(const uid of Array.isArray(campaign.gmUids)?campaign.gmUids:[])add(uid,'co-gm');
  for(const uid of Array.isArray(campaign.playerUids)?campaign.playerUids:[])add(uid,'player');
  for(const [uid,role] of Object.entries(map(campaign.roles))){
    if(role==='gm'||role==='co-gm')add(uid,'co-gm');
    else if(role==='player')add(uid,'player');
    else issues.push('invalid-legacy-role');
  }
  for(const [uid,details] of Object.entries(map(campaign.players))){
    const row=users.get(uid),status=details?.status||'active';
    if(!validStatus(status)){issues.push('invalid-legacy-status');continue;}
    if(row){
      if(row.role==='owner'&&status!=='active'){issues.push('invalid-owner-status');continue;}
      row.status=status;
    }else if(isId(uid)&&status!=='active')users.set(uid,{uid,role:'player',status});
    else issues.push('unverified-legacy-account');
  }
  return users;
}
function isLinked(campaign,id,character){
  const owner=character?.ownerUid;
  if(!isId(id)||!isId(owner)||!isId(campaign.id))return false;
  if(character.sharedCampaignId&&character.sharedCampaignId!==campaign.id)return false;
  const link=campaign.playerCharacterLinks?.[id];
  const summary=campaign.characters?.[id]?.ownerUid;
  if((link&&link!==owner)||(summary&&summary!==owner))return false;
  return link===owner||summary===owner||
    (Array.isArray(campaign.players?.[owner]?.characterIds) &&
      campaign.players[owner].characterIds.includes(id));
}
export function gmCampaignMemberSummary({campaign={},characters={},members=null,rosterError=''}={}){
  const source=campaign?.membershipSchemaVersion===2?'canonical':'legacy';
  const issues=[];
  if(!isId(campaign?.id)||!isId(campaign?.ownerUid))return {
    source,state:'error',message:'Campaign identity requires review.',
    summary:null,members:[],issues:['invalid-campaign']
  };
  if(source==='canonical'&&!Array.isArray(members))return {
    source,state:rosterError?'error':'loading',
    message:rosterError||'Verifying campaign membership...',
    summary:null,members:[],issues
  };
  const users=source==='legacy'?legacyMembers(campaign,issues):new Map();
  if(source==='canonical'){
    for(const row of members){
      if(!isId(row?.uid)||row.id!==row.uid||row.campaignId!==campaign.id||
        !validRole(row.role)||!validStatus(row.status)||
        (row.role==='owner'&&(row.uid!==campaign.ownerUid||row.status!=='active'))||
        (row.uid===campaign.ownerUid&&row.role!=='owner')){
        issues.push('invalid-v2-member');continue;
      }
      if(users.has(row.uid)){issues.push('duplicate-v2-member');continue;}
      users.set(row.uid,{uid:row.uid,role:row.role,status:row.status});
    }
    if(!users.has(campaign.ownerUid))users.set(campaign.ownerUid,{
      uid:campaign.ownerUid,role:'owner',status:'active'
    });
  }
  const names=map(campaign.players);
  for(const row of users.values()){
    const data=map(names[row.uid]);
    row.displayName=safeName(data.displayName)||safeName(data.name)||'';
    row.characters=[];
  }
  let linked=0,unverified=0;
  for(const [id,character] of Object.entries(map(characters))){
    const row=users.get(character?.ownerUid);
    if(!row||!isLinked(campaign,id,character)){unverified++;continue;}
    row.characters.push({
      id,name:safeName(character.name)||id,
      level:Number.isSafeInteger(character.level)&&character.level>=0?character.level:null
    });
    linked++;
  }
  const order={owner:0,'co-gm':1,player:2};
  const rows=[...users.values()].sort((a,b)=>order[a.role]-order[b.role]||
    (a.displayName||a.uid).localeCompare(b.displayName||b.uid));
  for(const row of rows)row.characters.sort((a,b)=>a.name.localeCompare(b.name));
  const active=rows.filter(row=>row.status==='active');
  return {
    source,state:'ready',message:'',issues,members:rows,
    summary:{
      activePlayers:active.filter(row=>row.role==='player').length,
      activeGMs:active.filter(row=>row.role!=='player').length,
      inactive:rows.length-active.length,linkedCharacters:linked,
      unverifiedCharacters:unverified
    }
  };
}
