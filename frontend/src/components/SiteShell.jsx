import React, { useEffect, useRef } from 'react';
import wordmarkUrl from '../../../assets/header/asteria-wordmark.png';
import { PRIMARY_LINKS } from '../router/siteRoutes.mjs';

function NavigationLinks({ route, onNavigate }) {
  return PRIMARY_LINKS.map(link => (
    <a
      key={link.id}
      href={link.href}
      aria-current={route.navId === link.id ? 'page' : undefined}
      onClick={onNavigate}
    >
      {link.label}
    </a>
  ));
}

// One React-owned shell. No legacy DOM controllers or duplicate route listeners.
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
      <a className="site-skip-link" href="#site-main" onClick={focusMain}>Skip to main content</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-brand" href="#home" aria-label="Asteria TTRPG — Home">
            <img src={wordmarkUrl} alt="Asteria TTRPG" width="2048" height="682" />
          </a>
          <nav className="site-primary-navigation" aria-label="Primary navigation">
            <NavigationLinks route={route} />
          </nav>
          <details ref={mobileMenu} className="site-mobile-menu">
            <summary>Menu</summary>
            <nav className="site-mobile-navigation" aria-label="Mobile navigation">
              <NavigationLinks route={route} onNavigate={closeMobileMenu} />
            </nav>
          </details>
        </div>
      </header>
      <main className="site-main" id="site-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <p>Asteria TTRPG · Isolated React navigation preview</p>
      </footer>
    </>
  );
}
