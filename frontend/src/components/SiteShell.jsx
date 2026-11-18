import React, { useEffect, useRef } from 'react';
import { PRIMARY_LINKS } from '../router/siteRoutes.mjs';
import { CrystalButton } from './ui/CrystalButton.jsx';
import { AsteriaBrand } from './AsteriaBrand.jsx';
import { HeaderAccountControls } from './HeaderAccountControls.jsx';
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

// One React-owned header and CSS owner. There is no legacy listener, DOM
// move, setView wrapper or image/profile sizing patch.
export function SiteShell({ route, identity = null, children }) {
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
      <header className={styles.header} data-testid="site-header">
        <div className={styles.headerInner}>
          <AsteriaBrand />
          <nav className={styles.primaryNavigation} aria-label="Primary navigation" data-testid="site-primary-navigation">
            <NavigationLinks route={route} />
          </nav>
          <HeaderAccountControls identity={identity} />
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
        <p>Asteria TTRPG · Isolated React header preview</p>
      </footer>
    </>
  );
}
