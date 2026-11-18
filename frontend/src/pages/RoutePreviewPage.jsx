import React from 'react';

const EXPLANATIONS = Object.freeze({
  handbook: 'The Handbook route and its existing filters are recognised. Handbook content will move here with the Compendium migration.',
  lore: 'The Worlds & Lore route is ready. World entries and browsing will move here with the Compendium migration.',
  compendium: 'The Compendium route and search/filter parameters are retained. Definitions are not loaded into this preview yet.',
  'compendium-entry': 'This definition bookmark is recognised, including its selected tab. Entry content remains on the existing website until migrated.',
  'character-forge': 'The Character Forge route is available. Character creation and personal character records are not connected to this preview.',
  'campaign-forge': 'The Campaign Forge route is available. Campaign creation, access checks and GM tools are not connected to this preview.',
  account: 'Account navigation is ready. Login, profile and account data are not connected to this preview.',
  login: 'Login navigation is ready, but authentication remains on the existing website. No credentials are collected here.',
  'account-create': 'Account creation will move here after secure authentication and profile flows are migrated.',
  'forgot-password': 'Password reset will move here after the authentication migration. No email is collected in this preview.',
  profile: 'Profile details remain private and unavailable in this preview until the authentication migration.',
  settings: 'Account settings are not connected to your saved preferences or Firebase profile in this preview.',
  friends: 'Friends navigation is ready. Requests, friends and blocks remain on the existing website until migrated.',
  notifications: 'Notifications require authenticated subscriptions and are not connected to this preview.',
  dashboard: 'Dashboard navigation is ready. Campaign and character data remain on the existing website.',
  'gm-dashboard': 'The GM deep link is recognised. Campaign membership and GM permissions must be verified before the dashboard is enabled.',
  'character-dashboard': 'The character deep link is recognised. Ownership and character data remain protected and unavailable in this preview.',
  presentation: 'The presentation deep link is recognised. Campaign access and real-time session data are not connected here.',
  invitation: 'This campaign invitation link is recognised but is not redeemed in the preview. Use the current Asteria website to accept invitations.',
  'not-found': 'This URL does not match an available page. Check the link or return to Home.'
});

/** Explicit placeholders: never expose unauthenticated forms or private data. */
export function RoutePreviewPage({ route }) {
  const isMissing = route.id === 'not-found';
  return (
    <section className="site-route-preview" aria-labelledby="site-route-title">
      <p className="site-eyebrow">{isMissing ? 'Navigation' : 'Phase 1.2 routing preview'}</p>
      <h1 id="site-route-title">{route.title}</h1>
      <p className="site-route-description">{EXPLANATIONS[route.id] || EXPLANATIONS['not-found']}</p>
      {!isMissing && (
        <p className="site-preview-note">
          The page destination works in the new React router. Its original
          features remain on the existing website until their migration is complete.
        </p>
      )}
      <a className="site-return-home" href="#home">Return to Home</a>
    </section>
  );
}
