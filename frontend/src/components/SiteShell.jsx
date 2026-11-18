import React, { useEffect, useRef } from 'react';
import wordmarkUrl from '../../../assets/header/asteria-wordmark.png';
import { PRIMARY_LINKS } from '../router/siteRoutes.mjs';
import { CrystalButton } from './ui/CrystalButton.jsx';
import styles from './SiteShell.module.css';

function NavigationLinks({ route, onNavigate }) {
  return PRIMARY_LINKS.map(link => (
    <CrystalButton
      key={link.id}
      href={link.href}
      active={route.navId === link.id}
      variant="nav"
      size="compact"
      onClick={onNavigate}
    >
      {link.label}
    </CrystalButton>
  ));
}

// Shell is React-owned; navigation event ownership remains in useSiteRoute.
// CSS Modules isolate the layout from the previous website's global selectors.
export function SiteShell({ route, children }) {
  const mobileMenu = useRef(null);

  useEffect(() => {
    if (mobileMenu.current) mobileMenu.current.open = false;
  }, [route.hash]);

  function focusMain(event) {
    event.preventDefault();
    document.getElementById('site-main')?.focus();
  }

  function closeMobileMenu() {
    if (mobileMenu.current) mobileMenu.current.open = false;
  }

  return (
    <>
      <a className={styles.skipLink} href="#site-main" onClick={focusMain}>Skip to main content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#home" data-testid="site-brand" aria-label="Asteria TTRPG — Home">
            <img src={wordmarkUrl} alt="Asteria TTRPG" width="2048" height="682" />
          </a>
          <nav className={styles.primaryNavigation} aria-label="Primary navigation" data-testid="site-primary-navigation">
            <NavigationLinks route={route} />
          </nav>
          <details ref={mobileMenu} className={styles.mobileMenu} data-testid="site-mobile-menu">
            <summary>Menu</summary>
            <nav className={styles.mobileNavigation} aria-label="Mobile navigation">
              <NavigationLinks route={route} onNavigate={closeMobileMenu} />
            </nav>
          </details>
        </div>
      </header>
      <main className={styles.main} id="site-main" tabIndex={-1}>
        {children}
      </main>
      <footer className={styles.footer}>
        <p>Asteria TTRPG · Isolated React design-system preview</p>
      </footer>
    </>
  );
}
