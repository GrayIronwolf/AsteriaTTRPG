import React from 'react';
import { useAppearance } from '../appearance/AppearanceProvider.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import { isVerifiedOwnedSession } from '../auth/accountSecurityPolicy.mjs';
import { PageLayout } from '../components/ui/PageLayout.jsx';
import { Eyebrow, Heading, BodyText } from '../components/ui/Typography.jsx';
import { CrystalButton } from '../components/ui/CrystalButton.jsx';
import { HomeCarousel } from '../components/home/HomeCarousel.jsx';
import { HOME_ACTIONS } from '../home/homeContent.mjs';
import styles from './HomePage.module.css';

export function HomePage() {
  const { session } = useAuth();
  const { appearance } = useAppearance();
  const verified = isVerifiedOwnedSession(session);
  const fonts = [
    appearance.bodyFont === 'system' && styles.defaultReading,
    appearance.displayFont === 'system' && styles.defaultDisplay
  ];
  return (
    <section id="home" aria-labelledby="site-home-title" className={styles.home}>
      <HomeCarousel />
      <PageLayout as="div" width="wide" variant="section"
        className={[styles.introduction, ...fonts].filter(Boolean).join(' ')}>
        <Eyebrow className={styles.eyebrow}>Welcome to</Eyebrow>
        <Heading id="site-home-title" hero>Asteria</Heading>
        <BodyText className={styles.description}>
          A living tabletop role-playing world. Forge your character, shape your campaign
          and explore realms of myth, magic and adventure.
        </BodyText>
        <nav className={styles.actions} aria-label="Explore Asteria">
          {HOME_ACTIONS.map((action, index) => (
            (!action.requiresAccount || verified) && <CrystalButton
              key={action.id}
              href={action.href}
              variant={index === 0 ? 'primary' : 'secondary'}
              size="wide"
              data-testid={'site-home-action-' + action.id}
            >
              {action.label}
            </CrystalButton>
          ))}
        </nav>
      </PageLayout>
    </section>
  );
}
