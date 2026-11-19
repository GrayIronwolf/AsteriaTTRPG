import React, { useEffect, useRef, useState } from 'react';
import { CrystalButton } from './ui/CrystalButton.jsx';
import buttonStyles from './ui/CrystalButton.module.css';
import { getVerifiedHeaderIdentity } from './headerIdentity.mjs';
import styles from './HeaderAccountControls.module.css';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useNotifications } from '../notifications/NotificationsProvider.jsx';

/**
 * Phase 2.1 presentational account area. The isolated preview passes null
 * (guest). Never infer sign-in from localStorage or a legacy global API.
 * The trusted authenticated adapter belongs to the later Account migration.
 */
function verifiedNotificationCount(inbox,session){
  if(session.status!=='authenticated'||!session.profileAvailable||
     !inbox.available||!inbox.state.hasData)return 0;
  return inbox.state.unreadLatest;
}
export function HeaderAccountControls({ identity = null }) {
  const { session, busy, actions } = useAuth();
  const inbox=useNotifications();
  const unread=verifiedNotificationCount(inbox,session);
  const verified = getVerifiedHeaderIdentity(identity);
  const [ownedAvatar,setOwnedAvatar] = useState(null);
  const avatarUrl = ownedAvatar ?? verified?.avatarUrl ?? null;
  useEffect(() => {
    let active = true;
    setOwnedAvatar(null);
    if (session.status !== 'authenticated' || !session.identity?.avatarVersion ||
        !session.profileAvailable || typeof actions?.readAvatar !== 'function') return undefined;
    actions.readAvatar().then(url => { if(active) setOwnedAvatar(url); })
      .catch(() => { if(active) setOwnedAvatar(null); });
    return () => { active=false; };
  },[actions,session.status,session.user?.uid,session.identity?.avatarVersion,session.profileAvailable]);
  const [imageFailed, setImageFailed] = useState(false);
  const accountMenuRef = useRef(null);

  function closeAccountMenu() {
    if (accountMenuRef.current) accountMenuRef.current.open = false;
  }

  useEffect(() => setImageFailed(false), [avatarUrl]);

  if (!verified) {
    return (
      <div className={styles.guest} data-testid="site-header-account-controls">
        <CrystalButton href="#/account/login" size="compact" data-testid="site-header-login">
          Login
        </CrystalButton>
      </div>
    );
  }

  return (
    <div className={styles.signedIn} data-testid="site-header-account-controls">
      <a className={styles.notifications} href="#/account/notifications"
        aria-label={unread > 0 ? unread + ' unread notifications' : 'Notifications'}
        title="Notifications" data-testid="site-header-notifications">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="m3.5 6 8.5 7 8.5-7" />
        </svg>
        {unread > 0 && <span className={styles.unreadBadge} data-testid="site-header-unread">
          {unread > 99 ? '99+' : unread}
        </span>}
      </a>
      <details ref={accountMenuRef} className={styles.accountMenu} data-testid="site-header-account-menu">
        <summary className={[buttonStyles.button, buttonStyles.regular].join(' ')}
          aria-label="Account options" title="Account">
          <span className={buttonStyles.crystal}><span className={buttonStyles.label}>Account</span></span>
        </summary>
        <nav className={styles.accountLinks} aria-label="Account shortcuts">
          <a href="#/account/profile" onClick={closeAccountMenu}>My Profile</a>
          <a href="#/account/friends" onClick={closeAccountMenu}>Friends</a>
          <a href="#/account/notifications" onClick={closeAccountMenu}>
            Notifications{unread > 0 ? ' (' + unread + ')' : ''}
          </a>
          <a href="#/appearance" onClick={closeAccountMenu}>Appearance</a>
          <a href="#/account/settings" onClick={closeAccountMenu}>Account Settings</a>
          {session.status === 'authenticated' && actions && (
            <button type="button" className={styles.logoutButton} disabled={busy}
              data-testid="site-header-logout" onClick={async () => {
                closeAccountMenu();
                const response = await actions.signOut();
                if (response.ok) window.location.hash = '#home';
              }}>Logout</button>
          )}
        </nav>
      </details>
      <a
        className={styles.profile}
        href="#/account/profile"
        aria-label="Open My Profile"
        title={verified.username}
        data-testid="site-header-profile"
        onClick={closeAccountMenu}
      >
        <span className={styles.fallback} aria-hidden="true">{verified.initial}</span>
        {avatarUrl && !imageFailed && (
          <img key={avatarUrl} src={avatarUrl} alt="" className={styles.avatar}
            data-testid="site-header-avatar-image" loading="lazy" decoding="async"
            onError={() => setImageFailed(true)} />
        )}
      </a>
    </div>
  );
}
