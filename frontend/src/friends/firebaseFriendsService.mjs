import {assertHandle,assertCursor,validateLookup,validatePage,validateAction,
  validateMutationInput} from './friendContracts.mjs';

/** Shares the existing Auth/Functions instances; never a second Firebase app. */
export function createFirebaseFriendsService({auth,functions,functionsSdk,flags}){
  if(!auth||!functions||!functionsSdk||!flags)throw new TypeError('Friends needs existing Firebase clients.');
  function owner(){
    const uid=auth.currentUser?.uid;
    if(!uid)throw new Error('Sign in before using Friends.');
    return uid;
  }
  function ready(kind){
    if(flags.enabled!==true)throw new Error('Friends are not enabled in this React preview.');
    if(kind==='lookup'&&flags.lookup!==true)throw new Error('Player search is unavailable.');
    if(kind==='requests'&&flags.requests!==true)throw new Error('Friends requests are unavailable.');
  }
  async function call(name,input,kind){
    ready(kind);
    const uid=owner();
    const response=await functionsSdk.httpsCallable(functions,name)(input);
    if(auth.currentUser?.uid!==uid)throw new Error('Account changed during Friends action.');
    return response.data;
  }
  return Object.freeze({
    availability(){return {...flags};},
    async find(accountId){
      assertHandle(accountId);
      return validateLookup(await call('asteriaFriendAccountLookup',
        {action:'find',accountId},'lookup'));
    },
    async list(kind,cursor=0){
      assertCursor(cursor);
      const actions={incoming:'list',outgoing:'list',accepted:'list-friends',blocked:'list-blocked'};
      if(!Object.hasOwn(actions,kind))throw new Error('Invalid Friends list.');
      const input=kind==='incoming'||kind==='outgoing'?
        {action:'list',direction:kind,cursor}:{action:actions[kind],cursor};
      const response=await call('asteriaFriendRequests',input,'requests');
      const page=validatePage(response,kind==='incoming'||kind==='outgoing'?'requests':kind,cursor);
      if(kind==='incoming'||kind==='outgoing'){
        if(page.items.some(item=>item.direction!==kind))throw new Error('Invalid request direction.');
      }
      return page;
    },
    async change(action,accountId,expectedVersion){
      const input=validateMutationInput(action,accountId,expectedVersion);
      return validateAction(await call('asteriaFriendRequests',input,'requests'),action);
    }
  });
}
