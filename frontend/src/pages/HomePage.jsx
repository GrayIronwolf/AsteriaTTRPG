import React from 'react';
import heroUrl from '../../../assets/home/asteria-home-spider.webp';

export function HomePage() {
  return (
    <section id="home" className="site-home" aria-labelledby="site-home-title">
      <div className="site-hero-image">
        <img
          src={heroUrl}
          alt="A giant winged spider above a fantasy mountain city"
          width="1600"
          height="900"
          fetchPriority="high"
        />
      </div>
      <div className="site-home-content">
        <p className="site-eyebrow">Welcome to</p>
        <h1 id="site-home-title">Asteria</h1>
        <p className="site-introduction">
          A living tabletop role-playing world. Forge your character, shape your campaign,
          and explore realms of myth, magic and adventure.
        </p>
        <p className="site-preview-note">
          Phase 1.1 foundation preview. Navigation, user accounts and gameplay will
          be migrated and verified in later phases; use the existing website for them.
        </p>
      </div>
    </section>
  );
}
