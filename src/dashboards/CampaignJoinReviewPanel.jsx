import React, {useCallback, useEffect, useState} from 'react';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {Panel, StatusPill} from '../components/WorkspaceUI.jsx';

// Phase 3.3 only. Server checks owner / explicit Co-GM delegation, request
// revision, campaign capacity, and canonical active membership before writes.
export function CampaignJoinReviewPanel({campaignId}){
  const enabled=window.AsteriaFeatureFlags?.campaignJoinReview===true;
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [pendingUid,setPendingUid]=useState('');
  const [message,setMessage]=useState('');
  const refresh=useCallback(async()=>{
    if(!enabled || !campaignId)return;
    setLoading(true);
    try{
      const result=await firebaseService.listCampaignJoinRequests(campaignId);
      setData(result);
    }catch(error){
      setMessage(error?.message||'Could not load join requests.');
      setData(null);
    }finally{setLoading(false);}
  },[campaignId,enabled]);
  useEffect(()=>{
    setData(null);
    setMessage('');
    refresh();
  },[refresh]);

  if(!enabled)return null;
  const review=async(row,decision)=>{
    if(pendingUid || loading)return;
    const action=decision==='approve'?'approve':'decline';
    if(!window.confirm(`${action==='approve'?'Approve':'Decline'} this join request? The decision is recorded and cannot be reversed here.`))return;
    setPendingUid(row.uid);
    try{
      const result=await firebaseService.reviewCampaignJoinRequest(campaignId,row.uid,action,row.revision);
      setMessage(result.status==='approved'?'Request approved. The player now has campaign membership.':'Request declined. The player has not been granted access.');
      await refresh();
    }catch(error){
      setMessage(error?.message||'Unable to complete this review. Refresh and retry.');
      await refresh();
    }finally{setPendingUid('');}
  };
  const updateMode=async(next)=>{
    if(pendingUid || loading)return;
    if(next==='automatic' && !window.confirm('Automatically approve future join requests if there is capacity? This will grant immediate membership without GM review.'))return;
    setPendingUid('mode');
    try{
      await firebaseService.setCampaignJoinApprovalMode(campaignId,next);
      await refresh();
      setMessage('Campaign approval setting updated.');
    }catch(error){setMessage(error?.message||'Unable to change approval setting.');}
    finally{setPendingUid('');}
  };
  return <Panel title="Join Requests" eyebrow="Campaign Connections" action={<StatusPill>{data?.requests?.length||0} pending</StatusPill>}>
    <p className="react-help">Review incoming requests before accounts are added to the campaign. Character preferences do not link a character automatically.</p>
    <div className="react-action-row"><button type="button" disabled={loading||Boolean(pendingUid)} onClick={refresh}>Refresh Requests</button></div>
    {data?<div className="react-membership-summary">
      <div><small>Active Players</small><b>{data.activePlayers} / {data.capacity}</b></div>
      <div><small>Approval Mode</small><b>{data.approvalMode==='automatic'?'Automatic':'GM Approval'}</b></div>
    </div>:null}
    {data?.canSetMode?<label>Approval Settings
      <select aria-label="Campaign approval mode" value={data.approvalMode} disabled={loading||Boolean(pendingUid)} onChange={e=>updateMode(e.target.value)}>
        <option value="manual">GM approval required (default)</option>
        {data.autoAvailable?<option value="automatic">Automatically approve when capacity allows</option>:null}
      </select>
    </label>:null}
    {data?.approvalMode==='automatic'?<p className="react-help">New requests are automatically approved while capacity remains, and their decisions are recorded.</p>:null}
    <div className="react-record-list compact">
      {(data?.requests||[]).map(row=><article key={row.uid}>
        <div><b>{row.uid}</b><small>Requested character: {row.requestedCharacterId||'No preference'}</small><small>Submitted: {row.requestedAt||'Not recorded'}</small></div>
        <div className="react-action-row">
          <button type="button" className="primary" disabled={loading||Boolean(pendingUid)||data.activePlayers>=data.capacity} onClick={()=>review(row,'approve')}>Approve</button>
          <button type="button" disabled={loading||Boolean(pendingUid)} onClick={()=>review(row,'decline')}>Decline</button>
        </div>
      </article>)}
      {!loading&&!data?.requests?.length?<p className="react-help">No pending join requests.</p>:null}
    </div>
    {data?.truncated?<p className="react-help">More requests may be pending. Refresh after reviewing the visible batch.</p>:null}
    {loading?<p role="status">Loading join requests...</p>:null}
    {message?<p role="status" className="react-action-message">{message}</p>:null}
  </Panel>;
}
