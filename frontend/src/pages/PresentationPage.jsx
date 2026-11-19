import React from 'react';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import {useAppServices} from '../app/AppServices.jsx';
import {PageLayout} from '../components/ui/PageLayout.jsx';
import {Heading} from '../components/ui/Typography.jsx';
import {CampaignPresentationDisplay} from '../dashboard/CampaignPresentationWorkspace.jsx';

export function PresentationPage({route}){
  const {session}=useAuth(),services=useAppServices();
  const api=services.get('gameplay')?.media;
  const uid=isVerifiedOwnedSession(session)?session.user.uid:null;
  const campaignId=route.params?.campaignId||'';
  return <PageLayout as="section" width="wide" labelledBy="site-projector-title"
    data-testid="site-presentation-route">
    <Heading id="site-projector-title">Player Presentation</Heading>
    {!uid||!api?.availability().enabled?
      <p role="alert">Sign in to an approved campaign to view its presentation.</p>:
      <CampaignPresentationDisplay key={uid+':'+campaignId} api={api}
        campaignId={campaignId} fullscreen/>}
  </PageLayout>;
}
