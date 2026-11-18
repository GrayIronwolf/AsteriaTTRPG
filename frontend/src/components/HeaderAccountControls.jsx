import React, { useEffect, useRef, useState } from 'react';
import { CrystalButton } from './ui/CrystalButton.jsx';
import { getVerifiedHeaderIdentity } from './headerIdentity.mjs';
import styles from './HeaderAccountControls.module.css';
import { useAuth } from '../auth/AuthProvider.jsx';

/**
 * Phase 2.1 presentational account area. The isolated preview passes null
 * (guest). Never infer sign-in from localStorage or a legacy global API.
 * The trusted authenticated adapter belongs to the later Account migration.
 */
export function HeaderAccountControls({ identity = null }) {
  const { session, busy, actions } = useAuth();
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
          <img
            key={avatarUrl}
            src={avatarUrl}
            alt=""
            className={styles.avatar}
            data-testid="site-header-avatar-image"
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        )}
      </a>
      <details ref={accountMenuRef} className={styles.accountMenu} data-testid="site-header-account-menu">
        <summary aria-label="Account options" title="Account options">
          <span aria-hidden="true">⋮</span>
          {verified.notificationCount > 0 &&
            <span className={styles.unreadBadge} aria-label={verified.notificationCount + ' unread notifications'}>
              {verified.notificationCount === 99 ? '99+' : verified.notificationCount}
            </span>}
        </summary>
        <nav className={styles.accountLinks} aria-label="Account shortcuts">
          <a href="#/account/profile" onClick={closeAccountMenu}>My Profile</a>
          <a href="#/account/friends" onClick={closeAccountMenu}>Friends</a>
          <a href="#/account/notifications" onClick={closeAccountMenu}>
            Notifications{verified.notificationCount > 0 ? ' (' + verified.notificationCount + ')' : ''}
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
    </div>
  );
}
