import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PRIMARY_LINKS } from '../router/siteRoutes.mjs';
import { getMegaMenu } from '../navigation/megaMenuRegistry.mjs';
import { createDisposableScope } from '../runtime/disposableScope.mjs';
import { CrystalButton } from './ui/CrystalButton.jsx';
import { AsteriaBrand } from './AsteriaBrand.jsx';
import { HeaderAccountControls } from './HeaderAccountControls.jsx';
import { NavigationMegaMenu } from './NavigationMegaMenu.jsx';
import styles from './SiteShell.module.css';
import { useAuth } from '../auth/AuthProvider.jsx';

function NavigationLinks({ route, activeMenuId, mode, onOpenMenu, onNavigate, onCloseMenu }) {
  return PRIMARY_LINKS.filter(link => link.id !== 'home' && link.id !== 'account').map(link => {
    const hasMenu = Boolean(getMegaMenu(link.id));
    return (
      <CrystalButton
        key={link.id}
        href={link.href}
        active={route.navId === link.id}
        variant="nav"
        size={mode === 'desktop' ? 'regular' : 'compact'}
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
 * One React-owned header, mobile navigation disclosure and seven mega menus.
 * No legacy setView, cloned DOM buttons or second route event owner.
 */
export function SiteShell({ route, identity: suppliedIdentity = null, children }) {
  const {session} = useAuth();
  const identity = suppliedIdentity || session.identity;
  const mobileMenu = useRef(null);
  const panelRef = useRef(null);
  const lastTrigger = useRef(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuSearch, setMenuSearch] = useState('');

  const closeMobileMenu = useCallback(() => {
    if (mobileMenu.current) mobileMenu.current.open = false;
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setActiveMenuId(null);
    setMenuSearch('');
    if (restoreFocus && lastTrigger.current?.isConnected) {
      lastTrigger.current.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    closeMobileMenu();
    closeMenu();
  }, [route.hash, closeMobileMenu, closeMenu]);

  useEffect(() => {
    if (!activeMenuId) return;
    panelRef.current?.querySelector('input[type="search"]')?.focus({ preventScroll: true });

    const scope = createDisposableScope();
    scope.listen(document, 'keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
      }
    });

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      scope.dispose();
    };
  }, [activeMenuId, closeMenu]);

  function openMenu(id, trigger, mode) {
    if (activeMenuId === id) {
      closeMenu(true);
      return;
    }
    lastTrigger.current = mode === 'mobile'
      ? mobileMenu.current?.querySelector('summary') : trigger;
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
    <>
      <a className={styles.skipLink} href="#site-main" onClick={focusMain}>Skip to main content</a>
      <header className={styles.header} data-testid="site-header">
        <div className={styles.headerInner}>
          <AsteriaBrand />
          <nav className={styles.primaryNavigation} aria-label="Primary navigation" data-testid="site-primary-navigation">
            <NavigationLinks route={route} activeMenuId={activeMenuId} mode="desktop"
              onOpenMenu={openMenu} onNavigate={navigate} onCloseMenu={closeMenu} />
          </nav>
          <details ref={mobileMenu} className={styles.mobileMenu} data-testid="site-mobile-menu">
            <summary>Menu</summary>
            <nav className={styles.mobileNavigation} aria-label="Mobile navigation">
              <NavigationLinks route={route} activeMenuId={activeMenuId} mode="mobile"
                onOpenMenu={openMenu} onNavigate={navigate} onCloseMenu={closeMenu} />
              <div className={styles.mobileSettings} aria-label="Website settings">
                <span className={styles.mobileSettingsLabel}>Website settings</span>
                <CrystalButton href="#/appearance" variant="nav" size="compact"
                  active={route.id === 'appearance'} onClick={navigate}
                  data-testid="site-mobile-appearance-link">Appearance</CrystalButton>
              </div>
            </nav>
          </details>
          <HeaderAccountControls identity={identity} />
        </div>
      </header>
      {activeMenuId && (
        <NavigationMegaMenu
          menu={getMegaMenu(activeMenuId)}
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
    </>
  );
}
