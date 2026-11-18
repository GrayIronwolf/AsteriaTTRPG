// Reuse the existing server-only Asteria Friends callable contracts.
export const HANDLE = /^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
export const REQUEST_ACTIONS = Object.freeze(['send','accept','decline','cancel']);
export const RELATIONSHIP_ACTIONS = Object.freeze(['remove','block','unblock']);
export const FRIEND_FEATURES = Object.freeze({lookup:'friendAccountLookup',requests:'friendRequestsEnabled'});
export function validHandle(value) { return typeof value==='string' && HANDLE.test(value); }
export function assertHandle(value) {
  if(!validHandle(value)) throw new Error('Enter a full Username#00000 Account ID.');
  return value;
}
export function validVersion(value) {return Number.isSafeInteger(value)&&value>0;}
export function assertCursor(cursor) {
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>1000||cursor%20!==0)
    throw new Error('Invalid Friends page.');
  return cursor;
}
export function assertCandidate(row) {
  if(!row||typeof row!=='object'||Array.isArray(row)||
      typeof row.username!=='string'||!validHandle(row.accountId)||
      row.accountId!==row.username+'#'+row.accountId.slice(-5))
    throw new Error('Invalid Friends response.');
  return {username:row.username,accountId:row.accountId};
}
function exactKeys(value,keys){
  return value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).sort().join(',')===keys.split(',').sort().join(',');
}
export function validateLookup(value) {
  if(exactKeys(value,'found') && value.found===false) return {found:false};
  if(!exactKeys(value,'found,username,accountId') || value.found!==true)
    throw new Error('Invalid player search response.');
  return {found:true,...assertCandidate(value)};
}
export function validatePage(result,kind,cursor) {
  assertCursor(cursor);
  if(!exactKeys(result,'items,nextCursor')||!Array.isArray(result.items)||
      result.items.length>20||
      !(result.nextCursor===null||
      (Number.isSafeInteger(result.nextCursor)&&result.nextCursor>cursor&&
       result.nextCursor<=1000&&result.nextCursor%20===0)))
    throw new Error('Invalid Friends page response.');
  const items=result.items.map(item=>{
    const candidate=assertCandidate(item);
    if(!validVersion(item.version)) throw new Error('Invalid Friends row version.');
    if(kind==='requests'){
      if(!exactKeys(item,'accountId,direction,expiresAtMs,requestedAtMs,status,username,version')||
        !['incoming','outgoing'].includes(item.direction)||item.status!=='pending'||
        !Number.isSafeInteger(item.requestedAtMs)||
        !Number.isSafeInteger(item.expiresAtMs))
        throw new Error('Invalid friend request row.');
      return {...candidate,version:item.version,direction:item.direction,status:'pending',
        requestedAtMs:item.requestedAtMs,expiresAtMs:item.expiresAtMs};
    }
    const field=kind==='blocked'?'blockedAtMs':'friendsSinceMs';
    if(!exactKeys(item,kind==='blocked'?'accountId,blockedAtMs,username,version':
      'accountId,friendsSinceMs,username,version')||
      !Number.isSafeInteger(item[field])||item[field]<0)
      throw new Error('Invalid Friends row.');
    return {...candidate,version:item.version,[field]:item[field]};
  });
  return {items,nextCursor:result.nextCursor};
}
export function validateAction(result,action) {
  if(!exactKeys(result,'ok,status,version,expiresAtMs')||result.ok!==true||
    !validVersion(result.version)||!(result.expiresAtMs===null||
      Number.isSafeInteger(result.expiresAtMs)))
    throw new Error('Invalid Friends action response.');
  const expected={send:'pending',accept:'accepted',decline:'declined',
    cancel:'cancelled',remove:'removed',block:'blocked',unblock:'removed'};
  if(result.status!==expected[action] ||
    (RELATIONSHIP_ACTIONS.includes(action)&&result.expiresAtMs!==null))
    throw new Error('Invalid Friends action result.');
  return {ok:true,status:result.status,version:result.version};
}
export function validateMutationInput(action,accountId,version) {
  assertHandle(accountId);
  if(REQUEST_ACTIONS.includes(action)) {
    if(action!=='send'&&!validVersion(version)) throw new Error('Refresh this friend request.');
  } else if(RELATIONSHIP_ACTIONS.includes(action)) {
    if(action!=='block'&&!validVersion(version)) throw new Error('Refresh this relationship.');
    if(action==='block'&&version!==undefined&&!validVersion(version))
      throw new Error('Refresh this relationship.');
  } else throw new Error('Unsupported Friends action.');
  return {action,targetAccountId:accountId,
    ...(version===undefined?{}:{expectedVersion:version})};
}
export function confirmationText(action,accountId) {
  assertHandle(accountId);
  const messages={
    remove:'Remove '+accountId+'? This ends the friendship for both players. A seven-day reconnection cooldown applies.',
    block:'Block '+accountId+'? This ends any friendship and pending request. Unblocking does not restore the friendship. After the final unblock, a seven-day reconnection cooldown begins.',
    unblock:'Unblock '+accountId+'? Your previous friendship will not be restored. A seven-day reconnection cooldown begins after the final block is lifted.'
  };
  return messages[action]||'Confirm '+action+' for '+accountId+'?';
}
