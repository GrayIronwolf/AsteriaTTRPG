import React from 'react';
import { PageLayout } from '../components/ui/PageLayout.jsx';
import { Eyebrow, Heading, BodyText } from '../components/ui/Typography.jsx';
import { CrystalButton } from '../components/ui/CrystalButton.jsx';
import { HomeCarousel } from '../components/home/HomeCarousel.jsx';
import { ForgeCards } from '../components/home/ForgeCards.jsx';
import { HOME_ACTIONS } from '../home/homeContent.mjs';
import styles from './HomePage.module.css';

/**
 * Phase 2.3 React Home. No "Welcome"/"World Map" panels, no legacy view
 * controllers, no auth simulation, no duplicate CSS/JS overlays.
 */
export function HomePage() {
  return (
    <section id="home" aria-labelledby="site-home-title" className={styles.home}>
      <HomeCarousel />
      <PageLayout as="div" width="wide" variant="section" className={styles.introduction}>
        <Eyebrow className={styles.eyebrow}>Welcome to</Eyebrow>
        <Heading id="site-home-title" hero>Asteria</Heading>
        <BodyText className={styles.description}>
          A living tabletop role-playing world. Forge your character, shape your campaign
          and explore realms of myth, magic and adventure.
        </BodyText>
        <div className={styles.actions} aria-label="Explore Asteria">
          {HOME_ACTIONS.map((action, index) => (
            <CrystalButton
              key={action.id}
              href={action.href}
              variant={index === 0 ? 'primary' : 'secondary'}
              size="wide"
              data-testid={'site-home-action-' + action.id}
            >
              {action.label}
            </CrystalButton>
          ))}
        </div>
      </PageLayout>
      <PageLayout as="div" width="wide" variant="section" className={styles.forgeSection}>
        <div className={styles.sectionHeading}>
          <Eyebrow>Begin your story</Eyebrow>
          <h2>Make Asteria your own</h2>
          <p>Create a character or prepare a campaign for the adventures ahead.</p>
        </div>
        <ForgeCards />
      </PageLayout>
      <p className={styles.previewNotice}>
        React Home preview: Character Forge, Campaign Forge and Compendium destinations
        are not connected to account or gameplay data until their feature migrations.
      </p>
    </section>
  );
}
