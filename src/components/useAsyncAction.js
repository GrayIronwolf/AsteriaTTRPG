import { useEffect, useRef, useState } from 'react';

// A synchronous lock also covers two clicks before React can render disabled.
export function useAsyncAction() {
  const pending=useRef(null),mounted=useRef(true);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const run=(operation,success='Saved.')=>{
    if(pending.current) return pending.current;
    setBusy(true);setMessage('Saving…');
    pending.current=Promise.resolve().then(operation).then(result=>{
      if(mounted.current) setMessage(result?.ok===false?result.error || 'The change could not be saved.':result?.message || success);
      return result;
    }).catch(error=>{
      const errorMessage=error.message || String(error);
      if(mounted.current) setMessage(errorMessage);
      return {ok:false,error:errorMessage};
    }).finally(()=>{pending.current=null;if(mounted.current)setBusy(false);});
    return pending.current;
  };
  return {busy,message,run,setMessage};
}
