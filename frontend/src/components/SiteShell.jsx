import React from 'react';
import wordmarkUrl from '../../../assets/header/asteria-wordmark.png';

// The new site shell is React-owned; it never mounts legacy DOM or binds setView.
export function SiteShell({ children }) {
  return (
    <>
      <a className="site-skip-link" href="#site-main">Skip to main content</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="site-brand" href="#home" aria-label="Asteria TTRPG — Home">
            <img src={wordmarkUrl} alt="Asteria TTRPG" width="2048" height="682" />
          </a>
          <nav className="site-primary-navigation" aria-label="Primary navigation">
            <a href="#home" aria-current="page">Home</a>
            <span className="site-nav-upcoming">Compendium</span>
            <span className="site-nav-upcoming">Character Forge</span>
            <span className="site-nav-upcoming">Campaign Forge</span>
          </nav>
        </div>
      </header>
      <main className="site-main" id="site-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <p>Asteria TTRPG · Isolated React/Vite foundation preview</p>
      </footer>
    </>
  );
}
