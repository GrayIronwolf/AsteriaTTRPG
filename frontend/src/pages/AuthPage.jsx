import React, { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout.jsx';
import { SurfacePanel } from '../components/ui/SurfacePanel.jsx';
import { Eyebrow, Heading, BodyText } from '../components/ui/Typography.jsx';
import { CrystalButton } from '../components/ui/CrystalButton.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { validateAccountRegistrationFields } from '../../../src/state/accountRegistrationRecovery.mjs';
import { GENERIC_RESET_SUCCESS } from '../auth/authPolicy.mjs';
import styles from './AuthPage.module.css';

const EMPTY = Object.freeze({firstName:'',lastName:'',email:'',username:'',password:'',confirmPassword:''});

export function AuthPage({route}) {
  const {session,busy,available,actions} = useAuth();
  const [fields,setFields] = useState({...EMPTY});
  const [message,setMessage] = useState(null);
  const [done,setDone] = useState(false);
  useEffect(() => {
    setFields({...EMPTY});
    setMessage(null);
    setDone(false);
  }, [route.id]);
  const isCreate = route.id === 'account-create';
  const isReset = route.id === 'forgot-password';
  const title = isCreate ? 'Create Account' : isReset ? 'Reset Password' : 'Login';
  const update = key => event => setFields(current=>({...current,[key]:event.target.value}));
  async function submit(event) {
    event.preventDefault();
    if (busy || !available) return;
    setMessage(null);
    if (isCreate) {
      const checked=validateAccountRegistrationFields(fields);
      if (!checked.ok) {setMessage({error:true,text:checked.message});return;}
    }
    const result=isCreate ? await actions.createAccount(fields)
      : isReset ? await actions.resetPassword({email:fields.email})
      : await actions.signIn({email:fields.email,password:fields.password});
    if (!result.ok) {setMessage({error:true,text:result.error});return;}
    setFields(current=>({...current,password:'',confirmPassword:''}));
    setDone(true);
    const data=result.data || {};
    setMessage({error:false,text:isReset ? GENERIC_RESET_SUCCESS :
      isCreate ? 'Account created in Firebase Authentication. '+
      (data.profileStored ? 'Your account profile was saved. ' : 'Profile setup is pending. ')+
      (data.accountId ? 'Your Account ID is '+data.accountId+'. ' : '')+
      (data.verificationSent ? 'Check your inbox for the verification email. ' : '')+
      (data.warnings || []).join(' ')
      : 'Signed in to Asteria.'});
  }

  return <PageLayout as="section" width="reading" className={styles.page}
    labelledBy="site-auth-title" data-testid="site-auth-page">
    <Eyebrow>Asteria Account</Eyebrow>
    <Heading id="site-auth-title">{title}</Heading>
    <BodyText muted>This form uses the existing Asteria Firebase project. Account and campaign settings are migrated in later phases.</BodyText>
    {session.status==='checking' && <p role="status">Checking your session…</p>}
    {!available && <p role="status">Firebase authentication is not connected in this isolated preview.</p>}
    {message && <p role={message.error?'alert':'status'} className={message.error?styles.error:styles.success}
      data-testid="site-auth-message">{message.text}</p>}
    {session.status==='authenticated' && !isReset && !isCreate && <SurfacePanel className={styles.signedIn}>
      <BodyText>Signed in{session.identity?.username ? ' as '+session.identity.username : ''}.</BodyText>
      {!session.profileAvailable && <BodyText muted>Your saved account profile is not verified yet; private features remain unavailable.</BodyText>}
      <CrystalButton href="#home" variant="primary">Return to Home</CrystalButton>
      <CrystalButton variant="secondary" onClick={async()=>{
        const result=await actions.signOut();
        if (!result.ok) setMessage({error:true,text:result.error});
        else {setDone(false);setMessage({error:false,text:'Signed out.'});}
      }}>Logout</CrystalButton>
    </SurfacePanel>}
    {(!done || (!isReset && !isCreate && session.status!=='authenticated')) && <SurfacePanel as="form"
      className={styles.form} onSubmit={submit} data-testid="site-auth-form">
      {isCreate && <>
        <label htmlFor="asteria-first-name">First name
          <input id="asteria-first-name" type="text" autoComplete="given-name" maxLength={80}
            value={fields.firstName} onChange={update('firstName')} required/>
        </label>
        <label htmlFor="asteria-last-name">Last name
          <input id="asteria-last-name" type="text" autoComplete="family-name" maxLength={80}
            value={fields.lastName} onChange={update('lastName')} required/>
        </label>
        <label htmlFor="asteria-username">Username
          <input id="asteria-username" type="text" autoComplete="username" maxLength={24}
            value={fields.username} onChange={update('username')} required/>
        </label>
      </>}
      <label htmlFor="asteria-email">Email address
        <input id="asteria-email" type="email" autoComplete="email" maxLength={254}
          value={fields.email} onChange={update('email')} required/>
      </label>
      {!isReset && <label htmlFor="asteria-password">Password
        <input id="asteria-password" type="password" autoComplete={isCreate?'new-password':'current-password'}
          minLength={isCreate?6:undefined} value={fields.password} onChange={update('password')} required/>
      </label>}
      {isCreate && <label htmlFor="asteria-confirm">Confirm password
        <input id="asteria-confirm" type="password" autoComplete="new-password" minLength={6}
          value={fields.confirmPassword} onChange={update('confirmPassword')} required/>
      </label>}
      <CrystalButton type="submit" variant="primary" disabled={!available||busy||session.status==='checking'}
        data-testid="site-auth-submit">{busy ? 'Processing…' : isCreate?'Create Account':isReset?'Request password reset':'Login'}</CrystalButton>
    </SurfacePanel>}
    <nav className={styles.links} aria-label="Account authentication links">
      {!isCreate && <a href="#/account/create">Create Account</a>}
      {!isReset && <a href="#/account/forgot-password">Forgot password?</a>}
      {(isCreate||isReset) && <a href="#/account/login">Back to Login</a>}
      <a href="#home">Return to Home</a>
    </nav>
  </PageLayout>;
}
