import React,{useState} from 'react';
import {presentationAssetFileError,PRESENTATION_ASSET_LIMIT}
  from '../../../src/state/presentationAssetModel.mjs';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import styles from './GMPresentationAssets.module.css';

export function GMPresentationAssets({api,campaignId}){
  const assets=useCampaignStream(api,'watchPresentationAssets',[campaignId]);
  const [file,setFile]=useState(null),[title,setTitle]=useState(''),
    [caption,setCaption]=useState(''),[busy,setBusy]=useState(false),
    [notice,setNotice]=useState(''),[error,setError]=useState('');
  const action=async(data,label)=>{
    setBusy(true);setError('');setNotice('');
    try{
      await api.managePresentationAsset(campaignId,data);
      setNotice(label);
    }catch(e){setError(e?.message||'Presentation media update failed.');}
    finally{setBusy(false);}
  };
  const upload=async()=>{
    const problem=presentationAssetFileError(file);
    if(problem){setError(problem);return;}
    setBusy(true);setError('');setNotice('');
    try{
      await api.uploadPresentationAsset(campaignId,file,title.trim()||file.name,caption);
      setFile(null);setTitle('');setCaption('');
      setNotice('Private presentation file uploaded. Publish explicitly to share.');
    }catch(e){setError(e?.message||'File upload failed.');}
    finally{setBusy(false);}
  };
  return <section className={styles.section} data-testid="site-gm-presentation-media-library">
    <h3>Presentation Media</h3>
    <p>GM-private uploads for cinematic images, looping videos and PDF handouts.
      Uploaded files are not visible to viewers until explicitly published.</p>
    {assets.error?<p role="alert">{assets.error}</p>:null}
    <div className={styles.fields}>
      <label>Media file<input type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm,.pdf"
        disabled={busy} onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <label>Display title<input type="text" maxLength={120} value={title}
        disabled={busy} onChange={e=>setTitle(e.target.value)}/></label>
      <label>Caption<textarea maxLength={380} rows={2} value={caption}
        disabled={busy} onChange={e=>setCaption(e.target.value)}/></label>
    </div>
    <button type="button" disabled={busy||!file||assets.loading||
      Boolean(assets.error)||(assets.data||[]).filter(item=>item.status!=='archived').length>=PRESENTATION_ASSET_LIMIT}
      onClick={upload}>Upload as GM-private media</button>
    {assets.loading?<p role="status">Checking presentation media…</p>:null}
    <div className={styles.list}>
      {(assets.data||[]).filter(item=>item.status!=='archived').map(item=>
        <div className={styles.asset} key={item.id}>
          <strong>{item.name}</strong>
          <span>{item.kind} · {item.status} · {item.visibility}</span>
          <div className={styles.actions}>
            {item.status==='ready'&&item.visibility==='gm'?
              <button type="button" disabled={busy}
                onClick={()=>action({type:'publish',id:item.id,
                  expectedRevision:item.revision},'Media published. Select it in the scene picker.')}>
                Publish</button>:null}
            {item.status==='ready'&&item.visibility==='players'?
              <button type="button" disabled={busy}
                onClick={()=>action({type:'unpublish',id:item.id,
                  expectedRevision:item.revision},'Media made private. Any active scene was blacked out.')}>
                Unpublish</button>:null}
            <button type="button" disabled={busy}
              onClick={()=>{if(window.confirm('Archive this presentation asset and revoke its display?'))
                action({type:'archive',id:item.id,expectedRevision:item.revision},
                  'Asset archived. Remove its original Storage object when no longer required.');
              }}>Archive</button>
          </div>
        </div>)}
    </div>
    {notice?<p role="status">{notice}</p>:null}
    {error?<p role="alert">{error}</p>:null}
  </section>;
}
