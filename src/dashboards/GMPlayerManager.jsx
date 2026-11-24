import React,{useDeferredValue,useEffect,useMemo,useRef,useState} from 'react';
import {Panel,StatusPill} from '../components/WorkspaceUI.jsx';
import {firebaseService} from '../firebase/asteriaFirebaseService.js';
import {GMPlayerTools,GMPlayerLiveActions,GMPlayerActivity} from './GMPlayerOperations.jsx';
import {gmVerifiedPlayerCharacters} from '../state/gmPlayerOperationsModel.mjs';
import {
  GM_PLAYER_MANAGER_VIEWS,GM_PLAYER_MANAGER_DELEGATIONS,
  gmPlayerManagerAccess,gmPlayerManagerRoster,gmPlayerManagerFilter,gmPlayerManagerPage,gmPlayerManagerCapacity,
  gmPlayerManagerApprovalAllowed,gmPlayerManagerLifecycleAllowed
} from '../state/gmPlayerManagerModel.mjs';
import '../styles/gm-player-manager.css';

const roleLabel=value=>value==='co-gm'?'Co-GM':value==='owner'?'Owner':'Player';
const readable=value=>String(value||'').replace(/^./,first=>first.toUpperCase());
const errorText=error=>error?.message||'The request could not be completed.';
const validRevision=value=>Number.isSafeInteger(value)&&value>=1;
const sectionSupport={
  joins:'joinReview',characters:'characterApproval',invitations:'invitationManagement',
  access:'roster',activity:'activity'
};

function ReadOnlyNotice({children}){
  return <p className="react-gm-player-notice" role="status">{children}</p>;
}
function ActionButton({children,onClick,disabled=false,danger=false}){
  return <button type="button" className={danger?'react-gm-player-danger':''}
    disabled={disabled} onClick={onClick}>{children}</button>;
}
function RecordStatus({status}){
  return <StatusPill tone={status==='active'||status==='approved'?'success':''}>{readable(status)||'Unknown'}</StatusPill>;
}

export function GMPlayerManager({campaignId,campaign={},characters={},members=null,rosterError='',
  membership=null,uid='',presence={},events=[],session={},clock={},onOpenCharacter,onSelectCharacter,onNavigate}){
  const [view,setView]=useState('players');
  const [focusedCharacterId,setFocusedCharacterId]=useState('');
  const [checks,setChecks]=useState([]);
  const [checkError,setCheckError]=useState('');
  const [query,setQuery]=useState('');
  const [roleFilter,setRoleFilter]=useState('all');
  const [statusFilter,setStatusFilter]=useState('all');
  const [onlyOnline,setOnlyOnline]=useState(false);
  const [rosterPage,setRosterPage]=useState(1);
  const [rosterPageSize,setRosterPageSize]=useState(12);
  const deferredQuery=useDeferredValue(query);
  const [serverRoster,setServerRoster]=useState(null);
  const [joinData,setJoinData]=useState(null);
  const [linksData,setLinksData]=useState(null);
  const [lifecycleData,setLifecycleData]=useState(null);
  const [invitationData,setInvitationData]=useState(null);
  const [activityData,setActivityData]=useState(null);
  const [loadErrors,setLoadErrors]=useState({});
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState('');
  const [feedback,setFeedback]=useState('');
  const [revision,setRevision]=useState(0);
  const [cursorHistory,setCursorHistory]=useState([null]);
  const [cursorIndex,setCursorIndex]=useState(0);
  const [inviteRole,setInviteRole]=useState('player');
  const [inviteHours,setInviteHours]=useState(168);
  const [inviteUses,setInviteUses]=useState(1);
  const [issuedLink,setIssuedLink]=useState('');
  const [copyMessage,setCopyMessage]=useState('');
  const qrHost=useRef(null);
  const flags=typeof window!=='undefined'?window.AsteriaFeatureFlags||{}:{};
  const access=gmPlayerManagerAccess({campaign,actorUid:uid,membership,flags});
  // Membership reconciliation is independent of UI filters and search typing.
  const fullReport=useMemo(()=>gmPlayerManagerRoster({
    campaign,characters,members,rosterError,serverRoster,presence
  }),[campaign,characters,members,rosterError,serverRoster,presence]);
  const report=useMemo(()=>gmPlayerManagerFilter(fullReport,{
    query:deferredQuery,role:roleFilter,status:statusFilter,onlyOnline
  }),[fullReport,deferredQuery,roleFilter,statusFilter,onlyOnline]);
  const page=useMemo(()=>gmPlayerManagerPage(report,rosterPage,rosterPageSize),
    [report,rosterPage,rosterPageSize]);
  const verifiedCharacters=useMemo(()=>gmVerifiedPlayerCharacters({
    campaign,characters,report:fullReport
  }),[campaign,characters,fullReport]);
  const focused=verifiedCharacters.find(row=>row.id===focusedCharacterId)||verifiedCharacters[0]||null;
  const verifiedCharacterMap=useMemo(()=>Object.fromEntries(
    verifiedCharacters.map(row=>[row.id,row.character])
  ),[verifiedCharacters]);
  const verifiedIds=useMemo(()=>new Set(verifiedCharacters.map(row=>row.id)),
    [verifiedCharacters]);
  const capacity=gmPlayerManagerCapacity(campaign,joinData);
  const pendingJoins=Array.isArray(joinData?.requests)?joinData.requests:[];
  const pendingLinks=Array.isArray(linksData?.requests)?linksData.requests:[];
  const activeLinks=Array.isArray(lifecycleData?.links)?lifecycleData.links:[];
  const invitations=Array.isArray(invitationData?.invitations)?invitationData.invitations:[];
  const activity=Array.isArray(activityData?.events)?activityData.events:[];
  const scope=campaignId+':'+uid;
  const liveScope=useRef(scope);
  liveScope.current=scope;
  const owner=access.owner;

  // Page data is fetched from existing authenticated callable services.
  // Memberships and party resources are already observed by the live hook.
  useEffect(()=>{
    if(!access.gm||!campaignId||!uid)return;
    const tasks=[];
    const enqueue=(key,allowed,request)=>{
      if(allowed)tasks.push({key,request:Promise.resolve().then(request)});
    };
    enqueue('roster',(view==='players'||view==='access')&&access.roster,
      ()=>firebaseService.listCampaignPlayerRoster(campaignId));
    enqueue('joins',view==='joins'&&access.joinReview,
      ()=>firebaseService.listCampaignJoinRequests(campaignId));
    enqueue('links',view==='characters'&&access.characterApproval,
      ()=>firebaseService.listPendingCampaignCharacterLinks(campaignId));
    enqueue('lifecycle',view==='characters'&&access.characterLifecycle,
      ()=>firebaseService.listCampaignCharacterLifecycle(campaignId));
    enqueue('invitations',view==='invitations'&&access.invitationManagement,
      ()=>firebaseService.listSecureCampaignInvitations(campaignId,cursorHistory[cursorIndex]));
    enqueue('activity',view==='activity'&&access.activity,
      ()=>firebaseService.listCampaignMembershipActivity(campaignId));
    let active=true;
    if(!tasks.length){setLoading(false);return()=>{active=false;};}
    setLoading(true);
    setLoadErrors(previous=>({...previous,...Object.fromEntries(tasks.map(item=>[item.key,'']))}));
    // Never leave stale privileged controls visible after a refresh failure.
    for(const task of tasks){
      if(task.key==='roster')setServerRoster(null);
      else if(task.key==='joins')setJoinData(null);
      else if(task.key==='links')setLinksData(null);
      else if(task.key==='lifecycle')setLifecycleData(null);
      else if(task.key==='invitations')setInvitationData(null);
      else if(task.key==='activity')setActivityData(null);
    }
    Promise.allSettled(tasks.map(item=>item.request)).then(results=>{
      if(!active)return;
      const errors={};
      results.forEach((result,index)=>{
        const key=tasks[index].key;
        if(result.status!=='fulfilled'){
          errors[key]=errorText(result.reason);return;
        }
        const value=result.value;
        if(!value||value.campaignId!==campaignId){
          errors[key]='Campaign data did not match the selected campaign.';return;
        }
        if(key==='roster'){
          if(!Array.isArray(value.active)||!Array.isArray(value.inactive)){
            errors[key]='Server roster response is invalid.';return;
          }
          setServerRoster(value);
        }else if(key==='joins'){
          if(!Array.isArray(value.requests)){errors[key]='Join request response is invalid.';return;}
          setJoinData(value);
        }else if(key==='links'){
          if(!Array.isArray(value.requests)){errors[key]='Character approval response is invalid.';return;}
          setLinksData(value);
        }else if(key==='lifecycle'){
          if(!Array.isArray(value.links)){errors[key]='Character lifecycle response is invalid.';return;}
          setLifecycleData(value);
        }else if(key==='invitations'){
          if(!Array.isArray(value.invitations)){errors[key]='Invitation response is invalid.';return;}
          setInvitationData(value);
        }else if(key==='activity'){
          if(!Array.isArray(value.events)){errors[key]='Activity response is invalid.';return;}
          setActivityData(value);
        }
      });
      setLoadErrors(previous=>({...previous,...errors}));
      setLoading(false);
    });
    return()=>{active=false;};
  },[scope,view,revision,cursorIndex,access.gm,access.roster,access.joinReview,
    access.characterApproval,access.characterLifecycle,access.invitationManagement,access.activity]);

  // The existing Universal Check System is the only request and roll feed.
  // Subscribe only when an interactive or history section requires it.
  useEffect(()=>{
    setChecks([]);setCheckError('');
    if(!campaignId||!access.gm||!['live-actions','activity'].includes(view))return;
    let active=true,unsubscribe=null;
    try{
      unsubscribe=firebaseService.subscribeUniversalChecks(campaignId,rows=>{
        if(active&&firebaseService.currentUser()?.uid===uid)
          setChecks(Array.isArray(rows)?rows:[]);
      },{gm:true});
    }catch(error){if(active)setCheckError(errorText(error));}
    return()=>{active=false;unsubscribe?.();};
  },[campaignId,uid,access.gm,view]);

  // One-time invitation credentials must never survive a campaign/account switch.
  useEffect(()=>{
    setIssuedLink('');setCopyMessage('');setServerRoster(null);
    setJoinData(null);setLinksData(null);setLifecycleData(null);
    setInvitationData(null);setActivityData(null);
    setCursorHistory([null]);setCursorIndex(0);
    setFocusedCharacterId('');setChecks([]);setCheckError('');
  },[scope]);

  useEffect(()=>{setRosterPage(1);},[scope,deferredQuery,roleFilter,statusFilter,onlyOnline,rosterPageSize]);
  const refresh=()=>setRevision(value=>value+1);
  const focusCharacter=(characterId,nextView='player-tools')=>{
    if(!verifiedCharacters.some(row=>row.id===characterId))return;
    setFocusedCharacterId(characterId);
    onSelectCharacter?.(characterId);
    setFeedback('');
    setView(nextView);
  };
  const changeView=next=>{
    setFeedback('');setView(next);
    if(next==='invitations'){setIssuedLink('');setCopyMessage('');}
  };
  const run=async(key,request,success)=>{
    if(busy)return;
    setBusy(key);setFeedback('');
    try{
      const result=await request();
      if(result?.ok===false)throw Error(result.error||'The server rejected the change.');
      if(firebaseService.currentUser()?.uid!==uid||liveScope.current!==scope)
        throw Error('Campaign or account changed. Refresh your dashboard.');
      setFeedback(success||'Saved on the campaign server.');
      refresh();
    }catch(error){setFeedback(errorText(error));}
    finally{setBusy('');}
  };
  const reviewJoin=(row,decision)=>{
    if(!access.joinReview||!gmPlayerManagerApprovalAllowed(row,decision,capacity))return;
    if(!window.confirm((decision==='approve'?'Approve':'Decline')+' this campaign join request? The decision will be recorded.'))return;
    run('join:'+row.uid,()=>firebaseService.reviewCampaignJoinRequest(
      campaignId,row.uid,decision,row.revision),decision==='approve'?
      'Player approved. Character linking requires separate approval.':'Join request declined.');
  };
  const reviewLink=(row,decision)=>{
    if(!access.characterApproval||!row?.linkId||!validRevision(row.revision))return;
    if(!window.confirm((decision==='approve'?'Approve':'Decline')+' this character link? This will not edit the private Forge sheet.'))return;
    run('link:'+row.linkId,()=>firebaseService.reviewCampaignCharacterLink(
      campaignId,row.linkId,decision,row.revision),decision==='approve'?
      'Character linked to the campaign.':'Character link declined.');
  };
  const changeLifecycle=(row,action)=>{
    if(!access.characterLifecycle||!gmPlayerManagerLifecycleAllowed(row,action))return;
    const detail=action==='deactivate'?'Archive the campaign gameplay state and remove this character from active play?':
      action==='restore'?'Restore the archived campaign gameplay state?':
      'Unlink this character? Their original private Forge sheet is preserved.';
    if(!window.confirm(detail))return;
    run('lifecycle:'+row.linkId,()=>firebaseService.changeCampaignCharacterLifecycle(campaignId,{
      linkId:row.linkId,action,expectedRevision:row.revision
    }),readable(action)+' completed on the campaign server.');
  };
  const changeMemberStatus=(row,action)=>{
    if(!access.memberControls||!report.server||!row.controls.includes(action)||
      !validRevision(row.revision)||row.uid===campaign.ownerUid)return;
    const detail=action==='suspend'?'Suspend access while retaining character records?':
      action==='restore'?'Restore account access with the server membership checks?':
      action==='ban'?'Ban this account? Only the owner can restore a banned member.':
      'Remove account access while retaining character and audit records?';
    if(!window.confirm(detail))return;
    let reason='';
    if(action==='ban'||action==='remove'){
      const value=window.prompt('Reason (4–240 characters; stored in the audit record):','');
      if(value===null)return;
      reason=value.trim();
      if(reason.length<4||reason.length>240){setFeedback('A reason of 4–240 characters is required.');return;}
    }
    run('moderate:'+row.uid,()=>firebaseService.moderateCampaignMember(
      campaignId,row.uid,action,row.revision,row.status,reason),
    'Membership updated. Already downloaded offline copies cannot be recalled.');
  };
  const changeRole=row=>{
    if(!access.rolePermissions||!report.server||!row.roleEditable||
      !validRevision(row.revision)||row.uid===campaign.ownerUid)return;
    const nextRole=row.role==='co-gm'?'player':'co-gm';
    if(!window.confirm('Change '+(row.displayName||row.uid)+' to '+roleLabel(nextRole)+'? Campaign permissions change immediately.'))return;
    run('role:'+row.uid,()=>firebaseService.changeCampaignMemberRole(
      campaignId,row.uid,nextRole,row.revision,row.role,row.status),
    'Campaign role updated.');
  };
  const changeDelegation=(row,capability,enabled)=>{
    if(!access.rolePermissions||!report.server||!row.roleEditable||
      row.role!=='co-gm'||!validRevision(row.revision)||
      !GM_PLAYER_MANAGER_DELEGATIONS.some(item=>item.id===capability))return;
    if(!window.confirm((enabled?'Enable ':'Disable ')+capability+' for this Co-GM?'))return;
    run('delegation:'+row.uid,()=>firebaseService.setCampaignCoGmPermission(
      campaignId,row.uid,capability,enabled,row.revision,row.role,row.status),
    'Co-GM permission updated.');
  };
  const changeMode=next=>{
    if(!access.joinReview||!owner||joinData?.canSetMode!==true||
      (next==='automatic'&&joinData?.autoAvailable!==true))return;
    if(next==='automatic'&&!window.confirm('Automatically approve future join requests when space is available?'))return;
    run('join-mode',()=>firebaseService.setCampaignJoinApprovalMode(campaignId,next),
      'Join approval mode updated.');
  };
  const issueInvitation=()=>{
    const expiresInHours=Number(inviteHours),maxUses=Number(inviteUses);
    if(!access.invitationManagement||!owner||
      ![24,72,168,336,720].includes(expiresInHours)||
      !Number.isSafeInteger(maxUses)||maxUses<1||maxUses>25||
      !['player','co-gm'].includes(inviteRole))return;
    const linkBuilder=window.AsteriaSecureInvitationLinks?.link;
    if(typeof window.crypto?.randomUUID!=='function'||typeof linkBuilder!=='function'){
      setFeedback('Secure invitation creation requires HTTPS and the authenticated invitation link helper.');
      return;
    }
    if(!window.confirm('Create a one-time private '+roleLabel(inviteRole)+' invitation? The link cannot be recovered later.'))return;
    setIssuedLink('');setCopyMessage('');
    run('invite-issue',async()=>{
      const result=await firebaseService.issueSecureCampaignInvitation({
        campaignId,requestId:window.crypto.randomUUID(),type:'share-link',
        roleOffered:inviteRole,recipientEmail:null,expiresInHours,maxUses
      });
      if(firebaseService.currentUser()?.uid!==uid||liveScope.current!==scope)
        throw Error('Campaign or account changed. Private link will not be displayed.');
      if(result?.token&&result?.inviteId){
        const base=window.location.href.split('#')[0];
        setIssuedLink(linkBuilder(base,campaignId,result.inviteId,result.token));
      }else setCopyMessage('Invitation exists, but its one-time link is no longer available.');
      return result;
    },'Invitation created. Copy the private link now; it is not stored in the Player Manager.');
  };
  const changeInvitation=(row,action)=>{
    if(!access.invitationManagement||!owner||row.status!=='active'||!validRevision(row.revision))return;
    if(!window.confirm((action==='revoke'?'Revoke':'Expire')+' this invitation? Existing members are unaffected.'))return;
    run('invitation:'+row.inviteId,()=>firebaseService.changeSecureCampaignInvitation(
      campaignId,row.inviteId,action,row.revision),'Invitation '+(action==='revoke'?'revoked.':'expired.'));
  };
  const copyCampaignUCN=async()=>{
    const ucn=campaign?.ucn||campaign?.uniqueCampaignCode||'';
    if(!/^\d{12}$/.test(ucn)){setFeedback('This campaign does not have a valid 12-digit UCN.');return;}
    try{
      if(!navigator.clipboard?.writeText)throw Error('Clipboard is unavailable.');
      await navigator.clipboard.writeText(ucn);
      setFeedback('Campaign UCN copied. Players can use it in Campaign Forge.');
    }catch(error){setFeedback(errorText(error));}
  };
  const copyInvite=async()=>{
    if(!issuedLink)return;
    try{
      if(!navigator.clipboard?.writeText)throw Error('Clipboard is unavailable.');
      await navigator.clipboard.writeText(issuedLink);
      setCopyMessage('Private invitation link copied.');
    }catch(error){setCopyMessage(errorText(error));}
  };
  const showQr=()=>{
    if(!issuedLink||!qrHost.current)return;
    qrHost.current.replaceChildren();
    try{
      if(typeof window.QRCode!=='function')throw Error('Local QR generator is unavailable.');
      new window.QRCode(qrHost.current,{text:issuedLink,width:200,height:200,
        correctLevel:window.QRCode.CorrectLevel.M});
      setCopyMessage('QR generated locally. Treat it as a private invitation credential.');
    }catch(error){setCopyMessage(errorText(error));}
  };
  const gotoCharacter=(characterId,tab)=>{
    const character=characters[characterId];
    if(!character)return;
    onSelectCharacter?.(character.id);
    if(tab==='character')onOpenCharacter?.(character);
    else onNavigate?.({tab});
  };
  const stateMessage=(key,enabled)=>{
    if(!access.v2){
      if(campaign?.membershipSchemaVersion!=null&&campaign.membershipSchemaVersion!==1)
        return 'This campaign uses an unsupported membership schema. Administration is blocked.';
      return 'This legacy campaign uses its existing membership system. Upgrading to canonical membership requires a separately approved migration.';
    }
    if(!enabled)return 'This feature is staged but not activated. The necessary browser and server release switches remain off.';
    if(loadErrors[key])return loadErrors[key];
    return 'No records to display.';
  };
  const counts=report.summary;
  const readOnly=!access.v2||!report.server;

  return <section className="react-gm-player-manager" aria-label="GM Player Manager" data-testid="gm-player-manager">
    <header className="react-gm-player-heading">
      <div><p className="react-eyebrow">Campaign / Players</p><h2>Player Manager</h2>
        <p>Manage campaign accounts separately from their saved characters, requests, permissions and participation.</p></div>
      <div className="react-gm-player-head-actions">
        <StatusPill tone={access.v2?'success':''}>{access.v2?'Canonical Membership':'Legacy Membership'}</StatusPill>
        <ActionButton onClick={refresh} disabled={!!busy||loading}>Refresh</ActionButton>
      </div>
    </header>
    <div className="react-gm-player-metrics" aria-label="Player Manager summary">
      {[
        ['Active players',counts?.activePlayers],
        ['Active GMs',counts?.activeGMs],
        ['Linked characters',counts?.linkedCharacters],
        ['Inactive accounts',counts?.inactive],
        ['Pending joins',joinData?.requests?.length??(report.server?serverRoster?.summary?.pending:null)]
      ].map(([label,value])=><div className="react-gm-player-metric" key={label}>
        <small>{label}</small><strong>{value??'—'}</strong>
      </div>)}
    </div>
    <nav className="react-gm-player-sections" aria-label="Player Manager sections">
      {GM_PLAYER_MANAGER_VIEWS.map(item=><button type="button" key={item.id}
        aria-current={view===item.id?'page':undefined} onClick={()=>changeView(item.id)}>
        {item.label}{item.id==='joins'&&joinData?.requests?.length?
          <span>{joinData.requests.length}</span>:null}
      </button>)}
    </nav>
    {feedback?<p className="react-gm-player-feedback" role="status">{feedback}</p>:null}
    {loading?<p className="react-gm-player-loading" role="status">Refreshing {GM_PLAYER_MANAGER_VIEWS.find(item=>item.id===view)?.label}...</p>:null}
    {view==='players'?<Panel title="Campaign Players" eyebrow="Accounts, Online Presence & Linked Characters"
      action={<span>{report.matchCount} / {report.total} accounts</span>}>
      <div className="react-gm-player-filters">
        <label>Search accounts or characters<input type="search" value={query} onChange={e=>setQuery(e.target.value)}
          placeholder="Name, account or character" autoComplete="off"/></label>
        <label>Role<select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
          <option value="all">All roles</option><option value="player">Players</option>
          <option value="co-gm">Co-GMs</option><option value="owner">Owner</option>
        </select></label>
        <label>Status<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option><option value="active">Active</option>
          <option value="suspended">Suspended</option><option value="removed">Removed</option>
          <option value="banned">Banned</option>
        </select></label>
        <label className="react-gm-player-online-filter">
          <input type="checkbox" checked={onlyOnline} onChange={e=>setOnlyOnline(e.target.checked)}/>
          Online presence only
        </label>
        <label>Cards per page<select value={rosterPageSize}
          onChange={e=>setRosterPageSize(Number(e.target.value))}>
          <option value={8}>8 cards</option><option value={12}>12 cards</option>
          <option value={24}>24 cards</option>
        </select></label>
      </div>
      {report.state!=='ready'?<ReadOnlyNotice>{report.message}</ReadOnlyNotice>:null}
      {report.issues.length?<ReadOnlyNotice>{report.issues.length} membership record issue(s) require review; no unverified account is granted access.</ReadOnlyNotice>:null}
      {counts?.unverifiedCharacters?<ReadOnlyNotice>{counts.unverifiedCharacters} character record(s) were excluded because ownership links could not be verified.</ReadOnlyNotice>:null}
      <div className="react-gm-player-roster" aria-live="polite">
        {page.rows.map(row=><article key={row.uid} className="react-gm-player-account">
          <div className="react-gm-player-account-title">
            <div><h3>{row.displayName||row.uid}</h3><small>Account: {row.uid}</small></div>
            <div className="react-gm-player-badges"><RecordStatus status={row.status}/>
              <span className="react-gm-player-role">{roleLabel(row.role)}</span>
              {row.online?<span className="react-gm-player-online">Online</span>:<span className="react-gm-player-offline">Presence unavailable / offline</span>}
            </div>
          </div>
          <div className="react-gm-player-character-list">
            {row.characters.map(character=><div className="react-gm-player-character" key={character.id}>
              <div><strong>{character.name}</strong><small>{character.level!=null?'Level '+character.level:'Level not recorded'}</small></div>
              <div className="react-gm-player-actions">
                <ActionButton disabled={!verifiedIds.has(character.id)}
                  onClick={()=>focusCharacter(character.id)}>Player tools</ActionButton>
                <ActionButton disabled={!verifiedIds.has(character.id)}
                  onClick={()=>focusCharacter(character.id,'live-actions')}>Request check</ActionButton>
                <ActionButton disabled={!characters[character.id]} onClick={()=>gotoCharacter(character.id,'character')}>View sheet</ActionButton>
                <ActionButton disabled={!characters[character.id]} onClick={()=>gotoCharacter(character.id,'tools')}>GM tools</ActionButton>
                <ActionButton disabled={!characters[character.id]} onClick={()=>gotoCharacter(character.id,'inventory')}>Inventory</ActionButton>
              </div>
            </div>)}
            {!row.characters.length?<p className="react-gm-player-empty-note">No verified campaign characters for this account.</p>:null}
          </div>
        </article>)}
      </div>
      {report.state==='ready'&&!report.matchCount?<ReadOnlyNotice>No accounts match the current filters.</ReadOnlyNotice>:null}
      {report.matchCount>0?<div className="react-gm-player-pagination" aria-label="Player roster pages">
        <span>Showing {page.from}–{page.to} of {report.matchCount} accounts · Page {page.page} of {page.pages}</span>
        <div className="react-gm-player-actions">
          <ActionButton disabled={page.page<=1} onClick={()=>setRosterPage(p=>p-1)}>Previous</ActionButton>
          <ActionButton disabled={page.page>=page.pages} onClick={()=>setRosterPage(p=>p+1)}>Next</ActionButton>
        </div>
      </div>:null}
      {readOnly?<p className="react-gm-player-hint">Account administration requires an activated canonical server roster. This overview is read-only; online presence does not grant membership.</p>:null}
    </Panel>:null}

    {view==='player-tools'?<>
      <div className="react-gm-player-focus-choice">
        <label>Manage verified character<select value={focused?.id||''}
          onChange={event=>focusCharacter(event.target.value,'player-tools')}>
          {!verifiedCharacters.length?<option value="">No verified characters</option>:null}
          {verifiedCharacters.map(row=><option key={row.id} value={row.id}>
            {row.characterName} · {row.accountName}</option>)}
        </select></label>
      </div>
      <GMPlayerTools key={focused?.id||'none'} campaignId={campaignId}
        selected={focused} access={access} session={session} clock={clock}
        onOpenCharacter={onOpenCharacter} onNavigate={onNavigate}/>
    </>:null}
    {view==='live-actions'?<>
      <div className="react-gm-player-focus-choice">
        <label>Target player character<select value={focused?.id||''}
          onChange={event=>focusCharacter(event.target.value,'live-actions')}>
          {!verifiedCharacters.length?<option value="">No verified characters</option>:null}
          {verifiedCharacters.map(row=><option key={row.id} value={row.id}>
            {row.characterName} · {row.accountName}</option>)}
        </select></label>
      </div>
      {checkError?<ReadOnlyNotice>{checkError}</ReadOnlyNotice>:null}
      <GMPlayerLiveActions key={focused?.id||'none'} campaignId={campaignId}
        selected={focused} access={access} session={session} checks={checks}
        characters={verifiedCharacterMap} onNavigate={onNavigate}/>
    </>:null}
    {view==='joins'?<Panel title="Join Requests" eyebrow="Approval, Capacity & Onboarding"
      action={<span>{pendingJoins.length} pending</span>}>
      <p className="react-gm-player-hint">Share the campaign UCN through Campaign Forge. Joining never automatically links a private character sheet.</p>
      <div className="react-gm-player-actions"><ActionButton
        onClick={copyCampaignUCN} disabled={!/^\d{12}$/.test(campaign?.ucn||campaign?.uniqueCampaignCode||'')}>
        Copy campaign UCN
      </ActionButton></div>
      <div className="react-gm-player-capacity">
        <div><small>Campaign UCN</small><strong>{campaign?.ucn||campaign?.uniqueCampaignCode||'Unavailable'}</strong></div>
        <div><small>Player capacity</small><strong>{capacity.limit??'Review required'}</strong></div>
        <div><small>Active / remaining</small><strong>{capacity.verified?capacity.filled+' / '+capacity.remaining:'Not verified'}</strong></div>
      </div>
      {access.joinReview&&joinData?.canSetMode?<label className="react-gm-player-mode">Join approval policy
        <select value={joinData.approvalMode==='automatic'?'automatic':'manual'} disabled={!!busy}
          onChange={e=>changeMode(e.target.value)}>
          <option value="manual">GM approval</option>
          <option value="automatic" disabled={!joinData.autoAvailable&&joinData.approvalMode!=='automatic'}>Automatic (owner only)</option>
        </select></label>:null}
      {!access.joinReview?<ReadOnlyNotice>{stateMessage('joins',access.joinReview)}</ReadOnlyNotice>:null}
      {loadErrors.joins?<ReadOnlyNotice>{loadErrors.joins}</ReadOnlyNotice>:null}
      {access.joinReview&&joinData&&pendingJoins.length===0?<ReadOnlyNotice>No pending join requests.</ReadOnlyNotice>:null}
      <div className="react-gm-player-record-list">{access.joinReview&&pendingJoins.map(row=><article key={row.uid}>
        <div><h3>Account {row.uid}</h3><small>Requested {row.requestedAt||'Date unavailable'}</small>
          <p>Preferred character: {row.requestedCharacterId||'None selected'} (not automatically linked)</p></div>
        <div className="react-gm-player-actions">
          <ActionButton disabled={!!busy||!gmPlayerManagerApprovalAllowed(row,'approve',capacity)}
            onClick={()=>reviewJoin(row,'approve')}>Approve</ActionButton>
          <ActionButton disabled={!!busy||!gmPlayerManagerApprovalAllowed(row,'decline',capacity)}
            onClick={()=>reviewJoin(row,'decline')} danger>Decline</ActionButton>
        </div>
      </article>)}</div>
      {joinData?.truncated?<ReadOnlyNotice>Additional pending requests may exist. Review the current page, then refresh.</ReadOnlyNotice>:null}
    </Panel>:null}

    {view==='characters'?<div className="react-gm-player-section-grid">
      <Panel title="Character Approval Queue" eyebrow="Private Forge Links / GM Review">
        <p className="react-gm-player-hint">Only an authenticated owner's request can link a saved character. The private sheet is never copied into this approval queue.</p>
        {!access.characterApproval?<ReadOnlyNotice>{stateMessage('links',access.characterApproval)}</ReadOnlyNotice>:null}
        {loadErrors.links?<ReadOnlyNotice>{loadErrors.links}</ReadOnlyNotice>:null}
        {access.characterApproval&&linksData&&!pendingLinks.length?<ReadOnlyNotice>No pending character requests.</ReadOnlyNotice>:null}
        <div className="react-gm-player-record-list">{access.characterApproval&&pendingLinks.map(row=><article key={row.linkId}>
          <div><h3>{row.sourceCharacterId}</h3><small>Account {row.ownerUid} · Requested {row.requestedAt||'Date unavailable'}</small></div>
          <div className="react-gm-player-actions">
            <ActionButton disabled={!!busy||!validRevision(row.revision)} onClick={()=>reviewLink(row,'approve')}>Approve link</ActionButton>
            <ActionButton disabled={!!busy||!validRevision(row.revision)} onClick={()=>reviewLink(row,'decline')} danger>Decline</ActionButton>
          </div>
        </article>)}</div>
        {linksData?.truncated?<ReadOnlyNotice>More pending character requests exist; refresh after review.</ReadOnlyNotice>:null}
      </Panel>
      <Panel title="Campaign Character Lifecycle" eyebrow="Archive, Restore & Unlink">
        <p className="react-gm-player-hint">Deactivation preserves archived gameplay. Restore is server-validated; unlink preserves the original private Forge sheet.</p>
        {!access.characterLifecycle?<ReadOnlyNotice>{stateMessage('lifecycle',access.characterLifecycle)}</ReadOnlyNotice>:null}
        {loadErrors.lifecycle?<ReadOnlyNotice>{loadErrors.lifecycle}</ReadOnlyNotice>:null}
        {access.characterLifecycle&&lifecycleData&&!activeLinks.length?<ReadOnlyNotice>No active or archived links.</ReadOnlyNotice>:null}
        <div className="react-gm-player-record-list">{access.characterLifecycle&&activeLinks.map(row=><article key={row.linkId}>
          <div><h3>{characters[row.campaignCharacterId]?.name||row.sourceCharacterId}</h3>
            <small>Account {row.ownerUid}</small><p><RecordStatus status={row.status}/></p></div>
          <div className="react-gm-player-actions">
            {['deactivate','restore','unlink'].filter(action=>gmPlayerManagerLifecycleAllowed(row,action))
              .map(action=><ActionButton key={action} disabled={!!busy}
                danger={action!=='restore'} onClick={()=>changeLifecycle(row,action)}>{readable(action)}</ActionButton>)}
          </div>
        </article>)}</div>
      </Panel>
    </div>:null}

    {view==='invitations'?<Panel title="Secure Campaign Invitations" eyebrow="Owner-Only / One-Time Private Links">
      <p className="react-gm-player-hint">Invitations are recipient-bound or private share links. No email is sent. Issuing an invitation does not grant membership without GM approval.</p>
      {!access.invitationManagement?<ReadOnlyNotice>{stateMessage('invitations',access.invitationManagement)}</ReadOnlyNotice>:null}
      {access.invitationManagement?<div className="react-gm-player-invite-controls">
        <label>Offered role<select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}
          disabled={!!busy}><option value="player">Player</option><option value="co-gm">Co-GM (approval required)</option></select></label>
        <label>Expires in<select value={inviteHours} onChange={e=>setInviteHours(Number(e.target.value))}
          disabled={!!busy}><option value={24}>24 hours</option><option value={72}>3 days</option>
          <option value={168}>7 days</option><option value={336}>14 days</option>
          <option value={720}>30 days</option></select></label>
        <label>Maximum uses<input type="number" min="1" max="25" step="1" value={inviteUses}
          disabled={!!busy} onChange={e=>setInviteUses(e.target.value)}/></label>
        <ActionButton disabled={!!busy} onClick={issueInvitation}>Create secure invitation</ActionButton>
      </div>:null}
      {issuedLink&&access.invitationManagement?<div className="react-gm-player-one-time">
        <strong>One-time private invitation</strong>
        <p>Copy or generate a QR code now. The link cannot be recovered from the server.</p>
        <div className="react-gm-player-actions">
          <ActionButton onClick={copyInvite}>Copy private link</ActionButton>
          <ActionButton onClick={showQr}>Show local QR</ActionButton>
          <ActionButton onClick={()=>{setIssuedLink('');setCopyMessage('Link cleared from this page.');}}>Clear link</ActionButton>
        </div>
        <div ref={qrHost} className="react-gm-player-qr" aria-label="Private invitation QR code"/>
      </div>:null}
      {copyMessage?<p role="status">{copyMessage}</p>:null}
      {loadErrors.invitations?<ReadOnlyNotice>{loadErrors.invitations}</ReadOnlyNotice>:null}
      {access.invitationManagement&&invitationData&&!invitations.length?<ReadOnlyNotice>No invitation records on this page.</ReadOnlyNotice>:null}
      <div className="react-gm-player-record-list">{access.invitationManagement&&invitations.map(row=><article key={row.inviteId}>
        <div><h3>{row.type||'Invitation'} · {String(row.inviteId).slice(0,12)}</h3>
          <small>{roleLabel(row.roleOffered)} · {row.usedCount}/{row.maxUses} uses</small>
          <p>Expires: {row.expiresAt||'Unknown'} · <RecordStatus status={row.status}/></p></div>
        {row.status==='active'?<div className="react-gm-player-actions">
          <ActionButton disabled={!!busy} danger onClick={()=>changeInvitation(row,'revoke')}>Revoke</ActionButton>
          <ActionButton disabled={!!busy} onClick={()=>changeInvitation(row,'expire')}>Expire</ActionButton>
        </div>:null}
      </article>)}</div>
      {access.invitationManagement&&invitationData?<div className="react-gm-player-actions">
        <ActionButton disabled={!!busy||cursorIndex===0} onClick={()=>setCursorIndex(i=>Math.max(0,i-1))}>Previous</ActionButton>
        <ActionButton disabled={!!busy||!invitationData.nextCursor} onClick={()=>{
          const next=invitationData.nextCursor;
          setCursorHistory(old=>[...old.slice(0,cursorIndex+1),next]);
          setCursorIndex(i=>i+1);
        }}>Next</ActionButton>
      </div>:null}
    </Panel>:null}

    {view==='access'?<Panel title="Roles & Member Access" eyebrow="Owner Control / Delegated Co-GM Abilities">
      {!access.roster?<ReadOnlyNotice>{stateMessage('access',access.roster)}</ReadOnlyNotice>:null}
      {loadErrors.roster?<ReadOnlyNotice>{loadErrors.roster}</ReadOnlyNotice>:null}
      {access.roster&&!report.server?<ReadOnlyNotice>Waiting for the authorised server roster before allowing account changes.</ReadOnlyNotice>:null}
      {report.server&&!access.rolePermissions&&!access.memberControls?<ReadOnlyNotice>Role and member administration remain disabled until the corresponding backend release switches are activated.</ReadOnlyNotice>:null}
      <div className="react-gm-player-record-list">{report.server&&report.rows.map(row=><article key={row.uid}>
        <div><h3>{row.displayName||row.uid}</h3><small>{roleLabel(row.role)} · {row.status} · revision {row.revision||'unknown'}</small>
          {row.uid===campaign.ownerUid?<p>Campaign owner — cannot be removed, demoted or suspended.</p>:null}</div>
        <div className="react-gm-player-actions">
          {row.roleEditable&&access.rolePermissions?<ActionButton disabled={!!busy||!validRevision(row.revision)}
            onClick={()=>changeRole(row)}>{row.role==='co-gm'?'Make player':'Make Co-GM'}</ActionButton>:null}
          {row.role==='co-gm'&&row.roleEditable&&access.rolePermissions?
            GM_PLAYER_MANAGER_DELEGATIONS.map(capability=><ActionButton key={capability.id}
              disabled={!!busy||!validRevision(row.revision)}
              onClick={()=>changeDelegation(row,capability.id,row.capabilities?.[capability.id]!==true)}>
              {(row.capabilities?.[capability.id]?'Disable ':'Enable ')+capability.label}
            </ActionButton>):null}
          {access.memberControls&&row.controls.map(action=><ActionButton key={action}
            disabled={!!busy||!validRevision(row.revision)} danger={action==='ban'||action==='remove'}
            onClick={()=>changeMemberStatus(row,action)}>{readable(action)}</ActionButton>)}
        </div>
      </article>)}</div>
    </Panel>:null}

    {view==='activity'?<>
      {checkError?<ReadOnlyNotice>{checkError}</ReadOnlyNotice>:null}
      {loadErrors.activity?<ReadOnlyNotice>{loadErrors.activity}</ReadOnlyNotice>:null}
      <GMPlayerActivity events={events} checks={checks} characters={verifiedCharacterMap}
        membershipEvents={access.activity?activity:[]}
        membershipAvailable={access.activity&&Boolean(activityData)}
        selected={focused}/>
      {activityData?.limited?<ReadOnlyNotice>Older membership decisions exist beyond the bounded server activity response.</ReadOnlyNotice>:null}
    </>:null}
    <p className="react-gm-player-footnote">
      {sectionSupport[view]&&!access[sectionSupport[view]]?'This section is informational until its gated server feature is enabled. ':' '}
      All account, character and permission changes use existing authenticated Firebase functions. The dashboard does not write membership records directly.
    </p>
  </section>;
}
