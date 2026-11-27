import React,{useEffect,useState} from 'react';
import {PRESENTATION_MEDIA_SCENES,presentationAssetId}
  from '../../state/presentationAssetModel.mjs';
import styles from './PresentationMediaFrame.module.css';

/** A fresh Storage read is required whenever the scene changes.
 * Only server-approved media IDs are accepted; no download tokens or URLs.
 */
export function PresentationMediaFrame({api,campaignId,scene,assetId,restricted=false,
  title='',subtitle=''}){
  const [preview,setPreview]=useState(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true,url='';
    setPreview(null);setError('');
    if(!PRESENTATION_MEDIA_SCENES.includes(scene)||!presentationAssetId(assetId)){
      setError('No approved presentation media selected.');
      return ()=>{active=false;};
    }
    (async()=>{
      try{
        const blob=await api.fetchPresentationAsset(campaignId,assetId,{restricted});
        if(!active)return;
        url=URL.createObjectURL(blob);
        setPreview({url,type:blob.type});
      }catch(failure){
        if(active)setError(failure?.message||'Presentation media is unavailable.');
      }
    })();
    return ()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[api,campaignId,scene,assetId,restricted]);
  return <section className={styles.frame} data-testid="site-presentation-media-frame">
    {title?<h2>{title}</h2>:null}
    {subtitle?<p>{subtitle}</p>:null}
    {error?<p role="alert">{error}</p>:!preview?
      <p role="status">Checking permission and loading approved media…</p>:null}
    {preview&&scene==='image'?<img src={preview.url} alt={title||'Presentation image'}/>:null}
    {preview&&scene==='cinematic'?<video src={preview.url} controls autoPlay
      loop muted playsInline preload="metadata"/>:null}
    {preview&&scene==='handout'?<div className={styles.pdf}>
      <iframe title={title||'PDF handout'} src={preview.url}
        sandbox="allow-same-origin" referrerPolicy="no-referrer"/>
      <a href={preview.url} target="_blank" rel="noopener noreferrer">
        Open PDF in a new tab</a>
    </div>:null}
  </section>;
}
