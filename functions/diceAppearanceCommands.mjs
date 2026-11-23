/** Authenticated, transactional visual appearance writes separate from roll history. */
import {normalizeDiceAppearanceLibrary,applyDiceAppearanceMutation,validateDiceAppearanceAction}
 from '../src/dice/diceAppearanceCollections.mjs';
export async function diceAppearanceAction(db,uid,input,stamp=()=>new Date(),clock=()=>Date.now()){
 if(typeof uid!=='string'||!/^[A-Za-z0-9]{3,160}$/.test(uid))throw Error('Sign in to manage appearances.');
 const request=validateDiceAppearanceAction(input);
 const ref=db.doc('users/'+uid+'/diceAppearances/current');
 return db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  const library=normalizeDiceAppearanceLibrary(snap.exists?snap.data():{});
  if(['appearance-assign','appearance-unassign'].includes(request.action)){
   const owned=await tx.get(db.doc('users/'+uid+'/characters/'+request.characterId));
   if(!owned.exists||owned.data()?.ownerUid!==uid)throw Error('Only owned characters can receive dice appearances.');
  }
  const result=applyDiceAppearanceMutation(library,request,clock());
  tx.set(ref,{...result,ownerUid:uid,updatedAt:stamp()});
  return {ok:true,revision:result.revision,collectionCount:result.collections.length,
   defaultCollectionId:result.defaultCollectionId};
 });
}
