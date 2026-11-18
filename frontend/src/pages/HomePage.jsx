import React from 'react';
import heroUrl from '../../../assets/home/asteria-home-spider.webp';
import { PageLayout } from '../components/ui/PageLayout.jsx';
import { SurfacePanel } from '../components/ui/SurfacePanel.jsx';
import { Eyebrow, Heading, BodyText } from '../components/ui/Typography.jsx';
import styles from './HomePage.module.css';

export function HomePage() {
  return (
    <PageLayout as="section" width="wide" id="home" labelledBy="site-home-title" className={styles.home}>
      <div className={styles.heroImage} data-testid="site-hero-image">
        <img
          src={heroUrl}
          alt="A giant winged spider above a fantasy mountain city"
          width="1600"
          height="900"
          fetchPriority="high"
        />
      </div>
      <div className={styles.content}>
        <Eyebrow className={styles.eyebrow}>Welcome to</Eyebrow>
        <Heading id="site-home-title" hero>Asteria</Heading>
        <BodyText className={styles.introduction}>
          A living tabletop role-playing world. Forge your character, shape your campaign,
          and explore realms of myth, magic and adventure.
        </BodyText>
        <SurfacePanel as="aside" className={styles.previewNote}>
          <BodyText muted>
            Phase 1.3 design-system preview. Navigation uses React, while Compendium,
            Forges, accounts and gameplay remain available on the existing website
            until their migration is complete.
          </BodyText>
        </SurfacePanel>
      </div>
    </PageLayout>
  );
}
