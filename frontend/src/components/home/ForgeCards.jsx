import React from 'react';
import varkhynArtwork from '../../../../assets/home/asteria-home-varkhyn.webp';
import campaignBookArtwork from '../../../../assets/menus/forge-campaign-map-book.avif';
import { HOME_FORGE_CARDS } from '../../home/homeContent.mjs';
import styles from './ForgeCards.module.css';

const ARTWORK = Object.freeze({
  varkhyn: varkhynArtwork,
  book: campaignBookArtwork
});

/**
 * Home's two card destinations reuse the canonical hash router. Real character
 * and campaign data stay behind the existing feature/permission gates.
 */
export function ForgeCards() {
  return (
    <div className={styles.cards} data-testid="site-home-forge-cards">
      {HOME_FORGE_CARDS.map(card => (
        <a
          key={card.id}
          className={[styles.card, card.artwork === 'book' ? styles.bookCard : ''].filter(Boolean).join(' ')}
          href={card.href}
          data-testid={'site-home-forge-' + card.id}
        >
          <span className={styles.art} aria-hidden="true">
            <img
              src={ARTWORK[card.artwork]}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </span>
          <span className={styles.text}>
            <span className={styles.title}>{card.title}</span>
            <span className={styles.description}>{card.summary}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
