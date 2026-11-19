import React,{useEffect,useState} from 'react';
import {useAuth} from '../auth/AuthProvider.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import styles from './ConnectionBoundary.module.css';

/**
 * Never keep an authenticated private workspace mounted while offline.
 * When connectivity returns, remount its read-only subscriptions and demand
 * fresh server authorization; do not replay pending mutations or cached data.
 * Public guest previews remain accessible without a Firebase runtime.
 */
export function ConnectionBoundary({monitor,children}){
  const {session,actions}=useAuth();
  const [connection,setConnection]=useState(()=>monitor?.snapshot()||{state:'online',epoch:0});
  useEffect(()=>{
    if(!monitor){setConnection({state:'online',epoch:0});return;}
    return monitor.subscribe(setConnection);
  },[monitor]);
  const privateSession=session.status==='authenticated';
  const suspended=Boolean(monitor&&privateSession&&
    (connection.state==='offline'||connection.state==='unavailable'));
  if(suspended)return <main className={styles.wrap} data-testid="site-connection-suspended"
    id="site-main" tabIndex={-1}>
    <section className={styles.panel} aria-labelledby="site-connection-title">
      <h1 id="site-connection-title">
        {connection.state==='offline'?'Connection lost':'Connection unavailable'}
      </h1>
      <p role="alert">
        Your private campaign and character information is temporarily hidden.
        A new server verification is required before it can be displayed.
      </p>
      <div className={styles.actions}>
        {connection.state==='unavailable'&&<CrystalButton onClick={()=>monitor.retry()}
          data-testid="site-connection-retry">Retry connection</CrystalButton>}
        {actions?.signOut&&<CrystalButton onClick={()=>actions.signOut()}
          data-testid="site-connection-signout">Sign out</CrystalButton>}
      </div>
    </section>
  </main>;
  return <React.Fragment key={connection.epoch}>{children}</React.Fragment>;
}
