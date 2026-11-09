// Phase 3.2 — render a verified, server-read Account ID without creating one.
// Never infer an Account ID from the username, Auth UID, email or cached data.
const USERNAME=/^[A-Za-z0-9._-]{3,24}$/;
const NUMBER=/^\d{5}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const ID_FIELDS=['accountId','accountNumber','accountIdKey','accountIdAssignedAt'];
const has=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const shortText=(value,max=80)=>typeof value==='string'?value.trim().slice(0,max):'';

export function inspectAccountProfileDisplay({uid,authEmail,profile}={}) {
  if(typeof uid!=='string'||!UID.test(uid)||!profile||typeof profile!=='object'||
     Array.isArray(profile)||profile.uid!==uid) {
    return {status:'unavailable',username:'',name:'',email:'',accountId:null};
  }
  const username=shortText(profile.username,24);
  const name=[shortText(profile.firstName),shortText(profile.lastName)].filter(Boolean).join(' ');
  // Email comes from Firebase Authentication, not an untrusted profile string.
  const email=typeof authEmail==='string'?authEmail.trim():'';
  const base={status:'pending',username,name,email,accountId:null};
  const present=ID_FIELDS.filter(key=>has(profile,key));
  if(!present.length)return base;

  const number=profile.accountNumber;
  const id=profile.accountId;
  const key=profile.accountIdKey;
  const assignedAt=profile.accountIdAssignedAt;
  if(present.length!==ID_FIELDS.length || !USERNAME.test(username) ||
     profile.username!==username ||
     profile.usernameLower!==username.toLowerCase() ||
     typeof number!=='string'||!NUMBER.test(number)||
     id!==`${username}#${number}` ||
     key!==`${username.toLowerCase()}#${number}` ||
     typeof assignedAt!=='string' ||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(assignedAt) ||
     !Number.isFinite(Date.parse(assignedAt)) ||
     new Date(assignedAt).toISOString()!==assignedAt) {
    return {...base,status:'review'};
  }
  return {...base,status:'assigned',accountId:id};
}
