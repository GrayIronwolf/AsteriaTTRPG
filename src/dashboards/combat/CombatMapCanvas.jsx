import React,{useEffect,useState} from 'react';

export function useCampaignStream(api,method,args,enabled=true){
 const [value,setValue]=useState({loading:enabled,data:[],error:''});
 const scope=JSON.stringify(args||[]);
 useEffect(()=>{
  if(!enabled||typeof api?.[method]!=='function'){
   setValue({loading:false,data:[],error:''});return;
  }
  setValue({loading:true,data:[],error:''});
  try{return api[method](...args,data=>setValue({loading:false,data,error:''}),
    error=>setValue({loading:false,data:[],error:error?.message||'Map unavailable.'}));}
  catch(error){setValue({loading:false,data:[],error:error.message||'Map unavailable.'});}
 },[api,method,scope,enabled]);
 return value;
}
export function CampaignMapCanvas({api,campaignId,map,mode='gm',editing=false,onPoint=null,showGrid=true}){
 const [media,setMedia]=useState({url:'',error:'',loading:true});
 useEffect(()=>{
  let alive=true,objectUrl='';
  setMedia({url:'',error:'',loading:true});
  if(!map||!api?.fetchMapMedia){
   setMedia({url:'',error:'Map media is unavailable.',loading:false});return;
  }
  Promise.resolve(api.fetchMapMedia(campaignId,map,mode)).then(result=>{
   if(!alive)return;
   if(!result?.ok||!(result.blob instanceof Blob))throw Error(result?.error||'Unable to read map media.');
   objectUrl=URL.createObjectURL(result.blob);
   setMedia({url:objectUrl,error:'',loading:false});
  }).catch(error=>{if(alive)setMedia({url:'',error:error.message||'Map unavailable.',loading:false});});
  return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[api,campaignId,map?.id,map?.storagePath,map?.contentType,mode]);
 if(!map)return <p>No map selected.</p>;
 const columns=Math.max(1,Math.min(80,Number(map.gridColumns)||20));
 const rows=Math.max(1,Math.min(80,Number(map.gridRows)||15));
 const points=Array.isArray(map.tokens)?map.tokens.slice(0,128):[];
 return <div role={editing?'button':undefined} tabIndex={editing?0:undefined}
  aria-label={'GM map preview: '+String(map.name||'Battle Map')}
  data-testid="site-combat-map-canvas"
  onClick={event=>{
   if(!editing||typeof onPoint!=='function')return;
   const rect=event.currentTarget.getBoundingClientRect();
   if(rect.width<=0||rect.height<=0)return;
   onPoint({x:Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),
     y:Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))});
  }}
  onKeyDown={event=>{if(editing&&onPoint&&['Enter',' '].includes(event.key)){
   event.preventDefault();onPoint({x:50,y:50});
  }}}
  style={{position:'relative',width:'100%',minHeight:220,aspectRatio:
    map.width&&map.height?String(Number(map.width))+' / '+String(Number(map.height)):'4 / 3',
    background:'#111923',overflow:'hidden',cursor:editing?'crosshair':'default',borderRadius:8}}>
  {media.loading?<p role="status">Loading private battle-map preview…</p>:null}
  {media.error?<p role="alert">{media.error}</p>:null}
  {media.url?(map.kind==='video'?<video src={media.url} muted autoPlay loop playsInline
   style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}}/>:
   <img src={media.url} alt={String(map.name||'Battle Map')}
    style={{width:'100%',height:'100%',objectFit:'contain',display:'block'}}/>):null}
  {showGrid&&map.gridVisible!==false?<div aria-hidden="true" style={{
    position:'absolute',inset:0,pointerEvents:'none',
    backgroundImage:'linear-gradient(to right,rgba(255,255,255,.2) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.2) 1px,transparent 1px)',
    backgroundSize:(100/columns)+'% '+(100/rows)+'%'
   }}/>:null}
  {points.map((token,i)=><span key={token.id||i} title={String(token.label||'Token')}
    style={{position:'absolute',left:(Number(token.x)||0)+'%',top:(Number(token.y)||0)+'%',
     transform:'translate(-50%,-50%)',color:'#fff',background:'rgba(12,20,30,.85)',
     border:'1px solid #d2b66b',borderRadius:20,padding:'2px 6px',fontSize:11,
     maxWidth:'30%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',pointerEvents:'none'}}>
     {String(token.label||'Token')}</span>)}
 </div>;
}
