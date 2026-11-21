/**
 * Improvement 8: compact in-memory guards for verified presentation streams.
 * These are not an offline cache or an authorization substitute. On mismatch
 * the caller must close its Firestore listeners and hide all previous content.
 */
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const revision=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000;
const epoch=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const stableScene=(value,restricted)=>JSON.stringify({
  scene:value.scene,title:value.title||'',subtitle:value.subtitle||'',
  theme:value.theme||'obsidian',mapId:value.mapId||'',assetId:value.assetId||'',
  ...(restricted?{}:{
    characterIds:Array.isArray(value.characterIds)?value.characterIds:[],
    showRound:value.showRound===true,showPartyHP:value.showPartyHP===true
  })
});

/**
 * Monotonically accept published revisions within an epoch. Duplicate
 * Firestore metadata/permission callbacks do not force redundant renders.
 * Same-revision content changes and rollback are errors, never rendered.
 */
export function createPresentationRevisionGate({restricted=false}={}){
  let previous=null;
  return Object.freeze({
    accept(value){
      if(!record(value)||!revision(value.revision)||typeof value.scene!=='string')
        throw Error('Published presentation state could not be verified.');
      const nextEpoch=restricted?value.epoch:'member';
      if(restricted&&!epoch(nextEpoch))
        throw Error('The restricted presentation session is unverified.');
      const signature=stableScene(value,restricted);
      if(signature.length>5000)
        throw Error('Published presentation exceeded its safe state limit.');
      if(previous&&previous.epoch===nextEpoch){
        if(value.revision<previous.revision)
          throw Error('Older presentation revision received. Reconnect to verify.');
        if(value.revision===previous.revision){
          if(signature!==previous.signature)
            throw Error('Presentation changed without a new revision. Reconnect.');
          return false;
        }
      }
      previous={epoch:nextEpoch,revision:value.revision,signature};
      return true;
    },
    reset(){previous=null;}
  });
}

/** Suppresses duplicate *small projected* callbacks; never serializes media. */
export function createSmallProjectionGate(limit=8192){
  let signature=null;
  return Object.freeze({
    accept(value){
      // Large collections and blobs are passed through rather than cached.
      if(Array.isArray(value)&&value.length>32)return true;
      if(!record(value)&&!Array.isArray(value)&&value!==null)return true;
      let next;
      try{next=JSON.stringify(value)??'null';}
      catch{return true;}
      if(next.length>limit)return true;
      if(next===signature)return false;
      signature=next;
      return true;
    },
    reset(){signature=null;}
  });
}

/**
 * A changed subscription must render a loading/empty state before React's
 * effect cleanup runs; never show the previous campaign/scene's last frame.
 */
export function sameCampaignStreamScope(before,api,method,args,enabled){
  return before?.api===api&&before.method===method&&before.enabled===enabled&&
    Array.isArray(before.args)&&before.args.length===args.length&&
    args.every((arg,i)=>Object.is(arg,before.args[i]));
}
