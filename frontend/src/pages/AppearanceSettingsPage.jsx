import React from 'react';
import { useAppearance } from '../appearance/AppearanceProvider.jsx';
import {
  BACKGROUND_OPTIONS, BUTTON_THEME_OPTIONS, FONT_OPTIONS, TEXT_SIZE_OPTIONS
} from '../appearance/appearanceModel.mjs';
import { PageLayout, PageHeader } from '../components/ui/PageLayout.jsx';
import { SurfacePanel } from '../components/ui/SurfacePanel.jsx';
import { Heading, BodyText } from '../components/ui/Typography.jsx';
import { CrystalButton } from '../components/ui/CrystalButton.jsx';
import styles from './AppearanceSettingsPage.module.css';

/** Public, local-only preferences; not the authenticated Account Settings page. */
export function AppearanceSettingsPage() {
  const { appearance, updateAppearance, resetAppearance } = useAppearance();

  return (
    <PageLayout as="section" width="wide" className={styles.page}
      labelledBy="site-appearance-title" data-testid="site-appearance-page">
      <PageHeader eyebrow="Website appearance" id="site-appearance-title" title="Appearance" />
      <div data-page-shell="true">
        <nav data-page-rail="true" data-page-nav="true" aria-label="Appearance sections">
          <button type="button" data-page-nav-item="true"
            onClick={() => document.getElementById('appearance-background')?.scrollIntoView({block:'start'})}>Background colour</button>
          <button type="button" data-page-nav-item="true"
            onClick={() => document.getElementById('appearance-buttons')?.scrollIntoView({block:'start'})}>Button theme</button>
          <button type="button" data-page-nav-item="true"
            onClick={() => document.getElementById('appearance-typography')?.scrollIntoView({block:'start'})}>Typography</button>
        </nav>
        <div data-page-content="true" className={styles.content}>

      <BodyText>Choose the backgrounds and typography used by this React website preview.</BodyText>
      <BodyText muted>
        These preferences are saved only in this browser. Your account, notification
        and Firebase settings remain on the existing website until migrated.
      </BodyText>
      <SurfacePanel as="section" className={styles.section} id="appearance-background" aria-label="Background settings">
        <h2 className={styles.sectionTitle}>Background colour</h2>
        <div className={styles.modeGrid} role="group" aria-label="Background colour"
          data-testid="site-appearance-backgrounds">
          {BACKGROUND_OPTIONS.map(option => (
            <button key={option.id} type="button"
              className={styles.modeButton}
              aria-pressed={appearance.background === option.id}
              data-testid={'site-background-' + option.id}
              onClick={() => updateAppearance({ background: option.id })}>
              <span className={styles.swatch}
                style={{ backgroundColor: 'var(' + option.swatch + ')' }} aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </SurfacePanel>
      <SurfacePanel as="section" className={styles.section} id="appearance-buttons" aria-label="Button theme settings">
        <h2 className={styles.sectionTitle}>Button theme</h2>
        <div className={styles.fieldGrid}>
          <label className={styles.field} htmlFor="asteria-button-theme">
            <span>Button appearance</span>
            <select id="asteria-button-theme" data-testid="site-button-theme"
              value={appearance.buttonTheme}
              onChange={event => updateAppearance({ buttonTheme: event.target.value })}>
              {BUTTON_THEME_OPTIONS.map(option =>
                <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <div className={styles.buttonPreview} data-testid="site-button-theme-preview">
            <CrystalButton size="wide" type="button" disabled>Preview button</CrystalButton>
          </div>
        </div>
        <label className={styles.field} htmlFor="asteria-crystal-colour">
          <span>Crystal colour (buttons and Asteria logo stars)</span>
          <input id="asteria-crystal-colour" type="color" data-testid="site-crystal-colour"
            value={appearance.crystalColor}
            onChange={event => updateAppearance({ crystalColor: event.target.value })} />
        </label>
        <BodyText muted>Original crystal and metallic bezels are the default. Additional designs can be added here later.</BodyText>
      </SurfacePanel>
      <SurfacePanel as="section" className={styles.section} id="appearance-typography" aria-label="Typography settings">
        <h2 className={styles.sectionTitle}>Typography</h2>
        <div className={styles.fieldGrid}>
          <label className={styles.field} htmlFor="asteria-body-font">
            <span>Body font</span>
            <select id="asteria-body-font" data-testid="site-body-font"
              value={appearance.bodyFont}
              onChange={event => updateAppearance({ bodyFont: event.target.value })}>
              {FONT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className={styles.field} htmlFor="asteria-heading-font">
            <span>Heading font</span>
            <select id="asteria-heading-font" data-testid="site-display-font"
              value={appearance.displayFont}
              onChange={event => updateAppearance({ displayFont: event.target.value })}>
              {FONT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className={styles.field} htmlFor="asteria-text-size">
            <span>Text size</span>
            <select id="asteria-text-size" data-testid="site-text-size"
              value={appearance.textSize}
              onChange={event => updateAppearance({ textSize: event.target.value })}>
              {TEXT_SIZE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.example} data-testid="site-font-example">
          <h3>Enter the World of Asteria</h3>
          <p>Explore a world of myths, magic and extraordinary adventures.</p>
        </div>
      </SurfacePanel>
      <div className={styles.actions}>
        <CrystalButton variant="secondary" size="wide" onClick={resetAppearance}
          data-testid="site-appearance-reset">Restore defaults</CrystalButton>
      </div>
        </div>
      </div>
    </PageLayout>
  );
}
