import React, { useCallback, useEffect, useRef, useState } from 'react';
import { trapDialogTab } from '../../../src/components/dialogFocus.mjs';
import { PRIMARY_LINKS } from '../router/siteRoutes.mjs';
import { getMegaMenu } from '../navigation/megaMenuRegistry.mjs';
import { createDisposableScope } from '../runtime/disposableScope.mjs';
import { CrystalButton } from './ui/CrystalButton.jsx';
import buttonStyles from './ui/CrystalButton.module.css';
import { AsteriaBrand } from './AsteriaBrand.jsx';
import { HeaderAccountControls } from './HeaderAccountControls.jsx';
import { NavigationMegaMenu } from './NavigationMegaMenu.jsx';
import styles from './SiteShell.module.css';
import { useAuth } from '../auth/AuthProvider.jsx';
import { isVerifiedOwnedSession } from '../auth/accountSecurityPolicy.mjs';

function NavigationLinks({ route, activeMenuId, mode, onOpenMenu, onNavigate, onCloseMenu }) {
  return PRIMARY_LINKS.filter(link => link.id !== 'home' && link.id !== 'account').map(link => {
    const hasMenu = Boolean(getMegaMenu(link.id));
    return (
      <CrystalButton
        key={link.id}
        href={link.href}
        active={route.navId === link.id}
        variant="nav"
        size={mode === 'desktop' ? 'regular' : 'wide'}
        aria-haspopup={hasMenu ? 'dialog' : undefined}
        aria-controls={hasMenu ? 'site-mega-menu' : undefined}
        aria-expanded={hasMenu ? activeMenuId === link.id : undefined}
        onClick={event => {
          // Keep modified clicks and open-in-new-tab as ordinary bookmarks.
          if (hasMenu && event.button === 0 && !event.metaKey && !event.ctrlKey &&
              !event.shiftKey && !event.altKey) {
            event.preventDefault();
            onOpenMenu(link.id, event.currentTarget, mode);
          } else {
            onNavigate();
          }
        }}
        onKeyDown={event => {
          if (hasMenu && event.key === ' ') {
            event.preventDefault();
            onOpenMenu(link.id, event.currentTarget, mode);
          } else if (event.key === 'Escape' && activeMenuId) {
            event.preventDefault();
            onCloseMenu(true);
          }
        }}
        data-testid={'site-nav-' + link.id}
      >
        {link.label}
      </CrystalButton>
    );
  });
}

/**
 * One React header and modal lifecycle for the compact drawer and mega menus.
 */
export function SiteShell({ route, identity: suppliedIdentity = null, children }) {
  const {session} = useAuth();
  const identity = suppliedIdentity || session.identity;
  const drawerTrigger = useRef(null);
  const drawerRef = useRef(null);
  const panelRef = useRef(null);
  const lastTrigger = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuSearch, setMenuSearch] = useState('');

  const closeMobileMenu = useCallback((restoreFocus = false) => {
    setDrawerOpen(false);
    if (restoreFocus) drawerTrigger.current?.focus({ preventScroll: true });
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setActiveMenuId(null);
    setMenuSearch('');
    if (restoreFocus) {
      const trigger = lastTrigger.current;
      (trigger?.isConnected && trigger.getClientRects().length ? trigger : drawerTrigger.current)
        ?.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    closeMobileMenu();
    closeMenu();
  }, [route.hash, closeMobileMenu, closeMenu]);

  useEffect(() => {
    if (!activeMenuId && !drawerOpen) return;
    const panel = activeMenuId ? panelRef.current : drawerRef.current;
    panel?.querySelector(activeMenuId ? 'input[type="search"]' : 'button')
      ?.focus({ preventScroll: true });

    const scope = createDisposableScope();
    scope.listen(document, 'keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (activeMenuId) closeMenu(true);
        else closeMobileMenu(true);
      } else {
        trapDialogTab(event, panel, document.activeElement);
      }
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      scope.dispose();
    };
  }, [activeMenuId, drawerOpen, closeMenu, closeMobileMenu]);

  function openMenu(id, trigger, mode) {
    if (activeMenuId === id) {
      closeMenu(true);
      return;
    }
    lastTrigger.current = mode === 'mobile' ? drawerTrigger.current : trigger;
    closeMobileMenu();
    setMenuSearch('');
    setActiveMenuId(id);
  }

  function focusMain(event) {
    event.preventDefault();
    document.getElementById('site-main')?.focus();
  }

  function navigate() {
    closeMenu();
    closeMobileMenu();
  }

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#site-main" onClick={focusMain}>Skip to main content</a>
      <header className={styles.header} data-testid="site-header">
        <div className={styles.headerInner}>
          <AsteriaBrand />
          <nav className={styles.primaryNavigation} aria-label="Primary navigation" data-testid="site-primary-navigation">
            <NavigationLinks route={route} activeMenuId={activeMenuId} mode="desktop"
              onOpenMenu={openMenu} onNavigate={navigate} onCloseMenu={closeMenu} />
          </nav>
          <div className={styles.headerActions}>
            <HeaderAccountControls identity={identity} />
            <details open={drawerOpen} className={styles.mobileMenu} data-testid="site-mobile-menu">
              <summary ref={drawerTrigger} aria-label="Open navigation and appearance"
                aria-haspopup="dialog" aria-expanded={drawerOpen} aria-controls="site-navigation-drawer"
                className={`${buttonStyles.button} ${buttonStyles.icon} ${styles.drawerTrigger}`}
                onClick={event => {
                  event.preventDefault();
                  if (drawerOpen) closeMobileMenu(true);
                  else setDrawerOpen(true);
                }}>
                <span className={buttonStyles.crystal} aria-hidden="true">
                  <span className={styles.menuIcon}><span /><span /><span /></span>
                </span>
              </summary>
            </details>
          </div>
        </div>
      </header>
      {drawerOpen && (
        <div className={styles.drawerLayer}>
          <div className={styles.drawerBackdrop} aria-hidden="true" onClick={() => closeMobileMenu(true)} />
          <section id="site-navigation-drawer" className={styles.drawer} ref={drawerRef}
            role="dialog" aria-modal="true" aria-labelledby="site-drawer-title" data-testid="site-navigation-drawer">
            <div className={styles.drawerHeading}>
              <h2 id="site-drawer-title">Navigation &amp; Appearance</h2>
              <button type="button" className={styles.drawerClose} aria-label="Close navigation and appearance"
                onClick={() => closeMobileMenu(true)}>×</button>
            </div>
            <nav className={styles.mobileNavigation} aria-label="Mobile navigation">
              <NavigationLinks route={route} activeMenuId={activeMenuId} mode="mobile"
                onOpenMenu={openMenu} onNavigate={navigate} onCloseMenu={closeMenu} />
            </nav>
            <div className={styles.mobileSettings} aria-label="Website settings">
              <CrystalButton href="#/appearance" size="compact" active={route.id === 'appearance'}
                onClick={navigate} data-testid="site-mobile-appearance-link">Appearance</CrystalButton>
              <CrystalButton href="#/version-log" size="compact" active={route.id === 'version-log'}
                onClick={navigate}>Open Version Log</CrystalButton>
            </div>
          </section>
        </div>
      )}
      {activeMenuId && (
        <NavigationMegaMenu
          menu={getMegaMenu(activeMenuId)}
          owned={isVerifiedOwnedSession(session)}
          query={menuSearch}
          onQueryChange={setMenuSearch}
          onClose={closeMenu}
          onNavigate={navigate}
          panelRef={panelRef}
        />
      )}
      <main className={styles.main} id="site-main" tabIndex={-1}>
        {children}
      </main>
      <footer className={styles.footer}>
        <p>Asteria TTRPG · <a href="#/appearance" data-testid="site-footer-appearance">Appearance</a></p>
      </footer>
    </div>
  );
}
