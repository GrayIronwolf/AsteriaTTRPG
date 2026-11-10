import {normaliseAccountUsername,validAccountNumber} from './accountIdentity.mjs';

const UID=/^[A-Za-z0-9_-]{1,128}$/;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const equal=(a,b)=>a===b;

function verifyAssigned(uid,profile,assignment,registry) {
  const number=assignment.accountNumber;
  const key=assignment.accountIdKey;
  if(!validAccountNumber(number)||
     assignment.uid!==uid||profile.uid!==uid||
     typeof assignment.username!=='string'||
     assignment.usernameLower!==assignment.username.toLowerCase()||
     assignment.accountId!==assignment.username+'#'+number||
     key!==assignment.usernameLower+'#'+number||
     !ISO.test(assignment.createdAt||'')||
     profile.username!==assignment.username||
     profile.usernameLower!==assignment.usernameLower||
     profile.accountId!==assignment.accountId||
     profile.accountIdKey!==key||
     profile.accountNumber!==number||
     profile.accountIdAssignedAt!==assignment.createdAt||
     !registry||registry.uid!==uid||
     registry.accountNumber!==number||
     registry.accountIdKey!==key||
     registry.accountId!==assignment.accountId||
     registry.usernameLower!==assignment.usernameLower||
     registry.createdAt!==assignment.createdAt)
    throw new Error('Account identity needs administrator reconciliation before a username change.');
  return number;
}

/**
 * Server-only, authenticated username change.
 *
 * UID and five-digit number remain permanent. The combined public handle
 * becomes NewUsername#same-number. The historical handle remains reserved
 * to the same UID as an alias, so a former invite reference cannot be
 * hijacked by a different account. All writes happen inside one transaction.
 *
 * Caller MUST provide a UID from verified Firebase Auth, not request data.
 */
export async function renameAccountIdentity(db,uid,newUsername,{expectedAccountId,now=new Date()}={}){
  if(typeof uid!=='string'||!UID.test(uid))throw new Error('Sign in to continue.');
  if(!db||typeof db.doc!=='function'||typeof db.runTransaction!=='function')
    throw new Error('Account database unavailable.');
  if(typeof expectedAccountId!=='string'||!expectedAccountId||
     !(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw new Error('Refresh your Account Profile before changing your username.');
  const {username,usernameLower}=normaliseAccountUsername(newUsername);
  return db.runTransaction(async tx=>{
    const profileRef=db.doc('users/'+uid),assignmentRef=db.doc('accountIdAssignments/'+uid);
    const [profileSnap,assignmentSnap]=await Promise.all([tx.get(profileRef),tx.get(assignmentRef)]);
    if(!profileSnap.exists||!assignmentSnap.exists)
      throw new Error('Account identity needs administrator reconciliation.');
    const profile=profileSnap.data()||{},assignment=assignmentSnap.data()||{};
    const oldKey=assignment.accountIdKey;
    if(typeof oldKey!=='string'||!oldKey||oldKey.includes('/'))
      throw new Error('Account identity needs administrator reconciliation.');
    const oldRef=db.doc('accountIdRegistry/'+oldKey);
    const oldSnap=await tx.get(oldRef);
    const number=verifyAssigned(uid,profile,assignment,oldSnap.exists?oldSnap.data():null);
    if(!equal(expectedAccountId,assignment.accountId))
      throw new Error('Your Account ID changed. Refresh your profile and retry.');
    const nextKey=usernameLower+'#'+number;
    const nextId=username+'#'+number;
    const nextRef=db.doc('accountIdRegistry/'+nextKey);
    const nextSnap=nextKey===oldKey?oldSnap:await tx.get(nextRef);
    if(nextSnap.exists){
      const record=nextSnap.data()||{};
      if(record.uid!==uid||record.accountNumber!==number||
         record.accountIdKey!==nextKey||
         record.usernameLower!==usernameLower)
        throw new Error('This username and account number combination is unavailable.');
    }
    if(nextId===assignment.accountId)return {
      ok:true,unchanged:true,username,accountId:nextId,accountNumber:number
    };
    const nextRecord={
      uid,usernameLower,accountNumber:number,accountId:nextId,
      accountIdKey:nextKey,createdAt:assignment.createdAt,
      alias:false,activeAccountIdKey:nextKey
    };
    if(nextKey===oldKey||nextSnap.exists)tx.update(nextRef,nextRecord);
    else tx.create(nextRef,nextRecord);
    if(nextKey!==oldKey)
      tx.update(oldRef,{alias:true,activeAccountIdKey:nextKey});
    tx.update(assignmentRef,{
      username,usernameLower,accountId:nextId,accountIdKey:nextKey
    });
    tx.update(profileRef,{
      username,usernameLower,displayName:username,
      accountId:nextId,accountIdKey:nextKey,
      updatedAt:now
    });
    return {
      ok:true,unchanged:false,username,
      accountId:nextId,accountNumber:number,previousAccountId:assignment.accountId
    };
  });
}
