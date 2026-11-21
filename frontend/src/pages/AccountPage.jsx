import React, { useEffect, useRef, useState } from 'react';
import { PageLayout, PageHeader } from '../components/ui/PageLayout.jsx';
import { SurfacePanel } from '../components/ui/SurfacePanel.jsx';
import { Heading, BodyText } from '../components/ui/Typography.jsx';
import { CrystalButton } from '../components/ui/CrystalButton.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import {classifyPrivateRoute,isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import { useAppearance } from '../appearance/AppearanceProvider.jsx';
import { copyableAccountId } from '../auth/accountProfileModel.mjs';
import { proposedAccountUsername, validatedEditableProfile, avatarUploadError } from '../../../src/state/accountProfileEdit.mjs';
import { verificationResendAvailable } from '../../../src/state/accountEmailVerification.mjs';
import styles from './AccountPage.module.css';

const SECTIONS = Object.freeze([
  {id:'profile',label:'My Profile'},
  {id:'settings',label:'Account Settings'},
  {id:'appearance',label:'Appearance'},
  {id:'security',label:'Password & Security'}
]);
const choose = route => route.id === 'settings'
  ? (route.query?.get('tab') === 'security' ? 'security' : 'settings') : 'profile';
const niceError = error => error instanceof Error
  ? error.message : 'This action could not be completed. Try again.';

export function AccountPage({route}) {
  const {session,available,actions,busy} = useAuth();
  const {appearance,updateAppearance} = useAppearance();
  const uid = session.user?.uid || null;
  const requestedSection = choose(route);
  const [section,setSection] = useState(requestedSection);
  const [profile,setProfile] = useState(null);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [loading,setLoading] = useState(false);
  const [editing,setEditing] = useState(false);
  const [names,setNames] = useState({firstName:'',lastName:''});
  const [renaming,setRenaming] = useState(false);
  const [username,setUsername] = useState('');
  const [renameEnabled,setRenameEnabled] = useState(false);
  const [avatar,setAvatar] = useState(null);
  const [avatarFile,setAvatarFile] = useState(null);
  const [verified,setVerified] = useState(false);
  const [verificationSentAt,setVerificationSentAt] = useState(0);
  const [cloud,setCloud] = useState(null);
  const [cloudLoading,setCloudLoading] = useState(false);
  const [cloudConflict,setCloudConflict] = useState(false);
  const requestVersion=useRef(0);
  const fileRef=useRef(null);
  const uidRef=useRef(uid);
  uidRef.current=uid;

  // Never preserve one user's profile, image, or cloud settings across a UID change.
  useEffect(()=>{
    const current=++requestVersion.current;
    setSection(requestedSection);
    setProfile(null);setAvatar(null);setCloud(null);
    setRenameEnabled(false);setRenaming(false);setEditing(false);
    setVerificationSentAt(0);setVerified(session.user?.emailVerified===true);
    setMessage('');setError('');setCloudConflict(false);setAvatarFile(null);
    if(!uid || !isVerifiedOwnedSession(session) || !actions?.readProfile)
      return undefined;
    let active=true;
    setLoading(true);
    Promise.all([actions.readProfile(),actions.readAvatar().catch(()=>null),actions.usernameAvailable().catch(()=>false)])
      .then(([next,url,canRename])=>{
        if(!active||requestVersion.current!==current||uidRef.current!==uid)return;
        setProfile(next);setAvatar(url);setRenameEnabled(canRename);
        setNames({firstName:next.firstName,lastName:next.lastName});
        setUsername(next.username);
      }).catch(err=>{
        if(active&&requestVersion.current===current)setError(niceError(err));
      }).finally(()=>{if(active&&requestVersion.current===current)setLoading(false);});
    return ()=>{active=false;};
  // Re-fetch on account switch and explicit updated profile revision, not on every header refresh.
  },[uid,actions,session.status,session.profileAvailable,route.id,requestedSection]);

  async function refresh() {
    const owner=uid;
    const version=++requestVersion.current;
    setLoading(true);setMessage('');setError('');
    try {
      const next=await actions.readProfile();
      const [url,canRename]=await Promise.all([
        actions.readAvatar().catch(()=>null),actions.usernameAvailable().catch(()=>false)
      ]);
      if(uidRef.current!==owner||requestVersion.current!==version)return;
      setProfile(next);setNames({firstName:next.firstName,lastName:next.lastName});
      setUsername(next.username);setAvatar(url);setRenameEnabled(canRename);
    }catch(err){if(uidRef.current===owner&&requestVersion.current===version)setError(niceError(err));}
    finally{if(uidRef.current===owner&&requestVersion.current===version)setLoading(false);}
  }
  async function perform(action,success) {
    if(busy)return;
    const owner=uid,version=requestVersion.current;
    setError('');setMessage('');
    try {
      const result=await action();
      if(owner!==uidRef.current||version!==requestVersion.current)return;
      if(!result?.ok){setError(result?.error||'The account update was not confirmed.');return;}
      setMessage(success);
      return result.data;
    }catch(err){if(owner===uidRef.current&&version===requestVersion.current)setError(niceError(err));}
  }
  async function saveNames(event) {
    event.preventDefault();
    let clean;
    try{clean=validatedEditableProfile(names);}
    catch(err){setError(niceError(err));return;}
    const result=await perform(()=>actions.saveProfile(clean),'Personal details saved.');
    if(result){setEditing(false);await refresh();setMessage('Personal details saved.');}
  }
  async function saveUsername(event) {
    event.preventDefault();
    let candidate;
    try {candidate=proposedAccountUsername(username,profile?.accountNumber);}
    catch(err){setError(niceError(err));return;}
    if(candidate.username===profile.username){setRenaming(false);return;}
    const result=await perform(()=>actions.renameUsername(candidate.username),
      'Username updated. Your new Account ID is '+candidate.accountId+'.');
    if(result){setRenaming(false);await refresh();setMessage('Username updated. Your new Account ID is '+candidate.accountId+'.');}
  }
  async function copyId() {
    const id=copyableAccountId(profile),owner=uid;
    if(!id)return;
    try {
      const current=await actions.readProfile();
      if(owner!==uidRef.current || copyableAccountId(current)!==id)
        throw new Error('Account ID changed or could not be verified. Refresh My Profile.');
      if(!navigator.clipboard?.writeText)throw new Error('Clipboard is unavailable.');
      await navigator.clipboard.writeText(id);
      if(owner===uidRef.current)setMessage('Account ID copied.');
    }catch(err){if(owner===uidRef.current)setError(niceError(err));}
  }
  async function changeAvatar(remove=false) {
    if(!remove) {
      const issue=avatarUploadError(avatarFile);
      if(issue){setError(issue);return;}
    }
    const result=await perform(
      ()=>remove?actions.removeAvatar():actions.uploadAvatar(avatarFile),
      remove?'Profile picture removed.':'Profile picture updated.'
    );
    if(result){
      setAvatarFile(null);
      if(fileRef.current)fileRef.current.value='';
      await refresh();
      setMessage(remove?'Profile picture removed.':'Profile picture updated.');
    }
  }
  async function loadCloud() {
    const owner=uid;setCloudLoading(true);setError('');setMessage('');
    try{
      const data=await actions.readAppearancePreferences();
      if(owner===uidRef.current){setCloud(data);setCloudConflict(false);}
    }catch(err){if(owner===uidRef.current)setError(niceError(err));}
    finally{if(owner===uidRef.current)setCloudLoading(false);}
  }
  async function syncToCloud() {
    if(!cloud || cloudLoading || busy)return;
    const owner=uid;
    setError('');setMessage('');
    try{
      const result=await actions.saveAppearancePreferences(appearance,cloud);
      if(owner!==uidRef.current)return;
      if(!result.ok){setError(result.error||'Cloud preferences could not be saved.');return;}
      if(result.data?.conflict){
        setCloudConflict(true);
        setError('Cloud preferences changed in another session. Reload before saving.');
        return;
      }
      setCloud(result.data?.cloud||null);setCloudConflict(false);
      setMessage('Appearance preferences saved to your account.');
    }catch(err){if(owner===uidRef.current)setError(niceError(err));}
  }
  function loadLocalFromCloud(){
    if(!cloud)return;
    updateAppearance(cloud.appearance);
    setMessage('Cloud appearance applied in this browser. Nothing was changed on the server.');
  }

  const access=classifyPrivateRoute(session,available);
  if(access==='checking'||access==='unavailable')return <PageLayout as="section" width="reading"
    className={styles.page} labelledBy="site-account-title" data-testid="site-account-page">
    <Heading id="site-account-title">Account</Heading>
    <BodyText>{access==='checking'?'Checking your account…':'Account features are unavailable in this offline preview.'}</BodyText>
  </PageLayout>;
  if(access!=='allowed')return <PageLayout as="section"
    width="reading" className={styles.page} labelledBy="site-account-title" data-testid="site-account-page">
    <Heading id="site-account-title">Account</Heading>
    <BodyText>{session.status==='authenticated'?
      'Your saved account profile could not be verified. Private account controls are disabled.':
      'Sign in to access your private Asteria account.'}</BodyText>
    <CrystalButton href="#/account/login" variant="primary">Login</CrystalButton>
  </PageLayout>;

  return <PageLayout as="section" width="wide" className={styles.page} labelledBy="site-account-title"
    data-testid="site-account-page">
    <PageHeader eyebrow="Asteria Account" id="site-account-title" title="Account" />
    <div data-page-shell="true">
      <nav data-page-rail="true" data-page-nav="true" aria-label="Account sections">
        {SECTIONS.map(item=><button key={item.id} type="button" data-testid={'site-account-tab-'+item.id}
          data-page-nav-item="true" aria-current={section===item.id?'page':undefined}
          onClick={()=>{setSection(item.id);setError('');setMessage('');}}>
          {item.label}
        </button>)}
      </nav>
      <div className={styles.main} data-page-content="true">
        {error&&<p role="alert" className={styles.notice} data-testid="site-account-error">{error}</p>}
        {message&&<p role="status" className={styles.notice} data-testid="site-account-message">{message}</p>}
        {section==='profile'&&<SurfacePanel as="section" className={styles.panel}
          data-testid="site-account-profile">
          <div className={styles.headingRow}>
            <h2>My Profile</h2>
            <CrystalButton onClick={refresh} size="compact" disabled={busy||loading}>Refresh</CrystalButton>
          </div>
          {loading?<BodyText>Loading your private profile…</BodyText>:profile&&<>
            <div className={styles.avatarRow}>
              {avatar?<img src={avatar} alt="Your profile avatar" className={styles.avatar}/>:
                <span className={styles.avatarFallback} aria-label="No profile picture">
                  {profile.username.slice(0,1).toUpperCase()}
                </span>}
              <div className={styles.avatarActions}>
                <label htmlFor="asteria-avatar-file">Profile picture (PNG, JPG or WEBP, maximum 4 MB)</label>
                <input id="asteria-avatar-file" type="file" accept="image/png,image/jpeg,image/webp"
                  ref={fileRef} onChange={event=>setAvatarFile(event.target.files?.[0]||null)}/>
                <div className={styles.actions}>
                  <CrystalButton onClick={()=>changeAvatar(false)} disabled={busy||!avatarFile}>Upload</CrystalButton>
                  <CrystalButton onClick={()=>changeAvatar(true)} disabled={busy||!avatar}>Remove</CrystalButton>
                </div>
              </div>
            </div>
            <dl className={styles.details}>
              <dt>Username</dt><dd data-testid="site-account-username">{profile.username}</dd>
              <dt>Name</dt><dd>{profile.name||'Not provided'}</dd>
              <dt>Email</dt><dd>{profile.email}</dd>
              <dt>Account ID</dt><dd>
                <strong data-testid="site-account-id">{copyableAccountId(profile)||'Not assigned'}</strong>
                <CrystalButton size="compact" disabled={!copyableAccountId(profile)} onClick={copyId}>Copy ID</CrystalButton>
              </dd>
            </dl>
            <BodyText muted>{profile.status==='assigned'?'Account ID verified from Firebase.':
              profile.status==='review'?'Account ID needs verification. Copy is disabled.':
              'Account ID has not been assigned yet.'}</BodyText>
            {!editing?<CrystalButton onClick={()=>{setEditing(true);setRenaming(false);}} size="compact">
              Edit personal details
            </CrystalButton>:<form className={styles.form} onSubmit={saveNames}>
              <label>First name<input value={names.firstName} maxLength={60}
                onChange={event=>setNames(current=>({...current,firstName:event.target.value}))}/></label>
              <label>Last name<input value={names.lastName} maxLength={60}
                onChange={event=>setNames(current=>({...current,lastName:event.target.value}))}/></label>
              <div className={styles.actions}>
                <CrystalButton type="submit" disabled={busy}>Save details</CrystalButton>
                <CrystalButton onClick={()=>setEditing(false)} disabled={busy}>Cancel</CrystalButton>
              </div>
            </form>}
            {renameEnabled&&profile.status==='assigned'&&<>
              {!renaming?<CrystalButton onClick={()=>{setRenaming(true);setEditing(false);}} size="compact">
                Change username
              </CrystalButton>:<form className={styles.form} onSubmit={saveUsername}>
                <label>New username<input value={username} maxLength={24} required
                  onChange={event=>setUsername(event.target.value)}/></label>
                <BodyText muted>Changing your username also changes the public Account ID prefix.
                  The server reserves the new handle; your five-digit number is preserved.</BodyText>
                <div className={styles.actions}>
                  <CrystalButton type="submit" disabled={busy}>Confirm username</CrystalButton>
                  <CrystalButton onClick={()=>setRenaming(false)} disabled={busy}>Cancel</CrystalButton>
                </div>
              </form>}
            </>}
          </>}
        </SurfacePanel>}
        {section==='settings'&&<SurfacePanel as="section" className={styles.panel}
          data-testid="site-account-settings">
          <h2>Account Settings</h2>
          <BodyText>Manage your public profile and account security. Private friends, campaign
            notifications and gameplay preferences remain in their existing systems until migrated.</BodyText>
          <div className={styles.actions}>
            <CrystalButton onClick={()=>setSection('profile')}>My Profile</CrystalButton>
            <CrystalButton onClick={()=>setSection('security')}>Password & Security</CrystalButton>
            <CrystalButton onClick={()=>setSection('appearance')}>Appearance</CrystalButton>
          </div>
        </SurfacePanel>}
        {section==='security'&&<SurfacePanel as="section" className={styles.panel}
          data-testid="site-account-security">
          <h2>Password & Security</h2>
          <BodyText>Your password and verification emails are managed by Firebase Authentication.</BodyText>
          <dl className={styles.details}>
            <dt>Email</dt><dd>{session.user.email}</dd>
            <dt>Email status</dt><dd data-testid="site-account-verified">
              {verified?'Verified':'Not verified'}</dd>
          </dl>
          <div className={styles.actions}>
            <CrystalButton disabled={busy} onClick={()=>perform(
              ()=>actions.sendOwnPasswordReset(),
              'Password reset email requested for your signed-in account.'
            )}>Send password reset email</CrystalButton>
            {!verified&&<CrystalButton disabled={busy||!verificationResendAvailable(verificationSentAt)}
              onClick={async()=>{
                const result=await perform(()=>actions.resendVerification(),
                  'Verification email requested. Check your inbox.');
                if(result)setVerificationSentAt(Date.now());
              }}>Send verification email</CrystalButton>}
            <CrystalButton disabled={busy} onClick={async()=>{
              const result=await perform(()=>actions.checkVerification(),
                'Email verification checked.');
              if(result)setVerified(result.verified===true);
            }}>Check verification</CrystalButton>
          </div>
          <BodyText muted>Account ID completion and account deletion require separate
            server-controlled workflows and are not enabled by this page.</BodyText>
        </SurfacePanel>}
        {section==='appearance'&&<SurfacePanel as="section" className={styles.panel}
          data-testid="site-account-appearance">
          <h2>Appearance & Cloud Preferences</h2>
          <BodyText>Your current browser appearance is managed by the existing Appearance page.
            Cloud syncing is optional; it never automatically replaces local settings.</BodyText>
          <CrystalButton href="#/appearance" variant="secondary">Open Appearance</CrystalButton>
          <div className={styles.actions}>
            <CrystalButton onClick={loadCloud} disabled={cloudLoading||busy}>
              {cloudLoading?'Loading…':'Load cloud preferences'}</CrystalButton>
            {cloud&&<>
              <CrystalButton onClick={loadLocalFromCloud} disabled={busy}>Apply cloud to browser</CrystalButton>
              <CrystalButton onClick={syncToCloud} disabled={busy||cloudLoading}>Save browser to cloud</CrystalButton>
            </>}
          </div>
          {cloud&&<BodyText muted data-testid="site-account-cloud-state">
            Cloud preference revisions: theme {cloud.themeRevision}, typography {cloud.typographyRevision}.
            {cloudConflict?' A newer version exists; reload to resolve the conflict.':''}
          </BodyText>}
        </SurfacePanel>}
      </div>
    </div>
  </PageLayout>;
}
