import React from 'react';
import {safeAudienceReveal}
  from '../../../src/state/presentationAudienceRevealModel.mjs';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import styles from './AudienceRevealCard.module.css';

/** Each display requests only its own UID's current, server-authorized reveal. */
export function AudienceRevealCard({api,campaignId,uid,audience,scene,epoch=''}) {
  const active=Boolean(uid&&scene&&scene.scene!=='blank'&&
    Number.isSafeInteger(scene.revision)&&scene.revision>=1);
  const result=useCampaignStream(api,'watchAudienceReveal',
    [campaignId,audience],active);
  if(!active||result.loading||result.error||!result.data)return null;
  const safe=safeAudienceReveal(result.data,uid,audience,scene,epoch);
  if(!safe)return null;
  return <aside className={styles.reveal} data-testid="site-audience-reveal"
    role="note" aria-label="Personal reveal from the Game Master">
    <strong>{safe.title}</strong>
    {safe.body?<p>{safe.body}</p>:null}
    <small>Private message to this account. Published for the current scene only.</small>
  </aside>;
}
