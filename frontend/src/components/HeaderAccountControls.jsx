import React, { useEffect, useState } from 'react';
import { CrystalButton } from './ui/CrystalButton.jsx';
import { getVerifiedHeaderIdentity } from './headerIdentity.mjs';
import styles from './HeaderAccountControls.module.css';

/**
 * Phase 2.1 presentational account area. The isolated preview passes null
 * (guest). Never infer sign-in from localStorage or a legacy global API.
 * The trusted authenticated adapter belongs to the later Account migration.
 */
export function HeaderAccountControls({ identity = null }) {
  const verified = getVerifiedHeaderIdentity(identity);
  const avatarUrl = verified?.avatarUrl ?? null;
  const [imageFailed, setImageFailed] = useState(false);

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
      <details className={styles.accountMenu} data-testid="site-header-account-menu">
        <summary aria-label="Account options" title="Account options">
          <span aria-hidden="true">⋮</span>
          {verified.notificationCount > 0 &&
            <span className={styles.unreadBadge} aria-label={verified.notificationCount + ' unread notifications'}>
              {verified.notificationCount === 99 ? '99+' : verified.notificationCount}
            </span>}
        </summary>
        <nav className={styles.accountLinks} aria-label="Account shortcuts">
          <a href="#/account/profile">My Profile</a>
          <a href="#/account/notifications">
            Notifications{verified.notificationCount > 0 ? ' (' + verified.notificationCount + ')' : ''}
          </a>
          <a href="#/appearance">Appearance</a>
          <a href="#/account/settings">Account Settings</a>
        </nav>
      </details>
    </div>
  );
}
