import React from 'react';
import { PageHeader, PageLayout } from '../components/ui/PageLayout.jsx';
import { SurfacePanel } from '../components/ui/SurfacePanel.jsx';
import { BodyText } from '../components/ui/Typography.jsx';
import styles from './VersionLogPage.module.css';

// The version notes and audit labels come from the original Version Log view.
const AUDIT_FIELDS = [
  'Characters', 'Campaigns', 'Creatures', 'Active Enemies',
  'Initiative', 'Roll History', 'Combat Log', 'Save State'
];

export function VersionLogPage() {
  return (
    <PageLayout width="wide" labelledBy="version-log-title" data-testid="site-version-log">
      <PageHeader eyebrow="Incremental React Migration" id="version-log-title" title="Version Log" />
      <SurfacePanel as="article" className={styles.release} aria-labelledby="version-log-release">
        <header>
          <h2 id="version-log-release">Asteria UI Modernisation Steps 7-12</h2>
          <span>Live Sessions</span>
        </header>
        <BodyText muted>
          This build keeps the unified compendium and RPG systems intact while adding Firebase account login,
          persistent sessions, and a logged-in workspace dashboard for campaigns, characters, activity, and account settings.
        </BodyText>
        <div className={styles.notes}>
          <section>
            <h3>Locked Foundation</h3>
            <ul>
              <li>Retained the v1.3.9.4 account and username login foundation.</li>
              <li>Retained the Compendium content folders and manifest system.</li>
              <li>Retained the Player and GM dashboards, inventory and bags, dice modal, and talent UI.</li>
            </ul>
          </section>
          <section>
            <h3>v1.7.1.3 Session Log Integration</h3>
            <ul>
              <li>Integrated Session Log System v1 into the GM Dashboard.</li>
              <li>Added Not Started, Active, Paused, Ended, and Archived session states.</li>
              <li>Added Start, Pause, Resume, End, Generate Log, Edit Log, Archive Log, and Export Markdown controls.</li>
              <li>Automatic collection records session events while the session is Active.</li>
              <li>Session events and Markdown export support Public, GM-only, and Hidden until revealed visibility labels.</li>
            </ul>
          </section>
        </div>
        <section className={styles.audit} aria-labelledby="version-log-audit">
          <h3 id="version-log-audit">System Audit</h3>
          <BodyText muted>The original v1.7.0 audit tracked these campaign and browser fields.</BodyText>
          <ul>{AUDIT_FIELDS.map(field => <li key={field}>{field}</li>)}</ul>
        </section>
      </SurfacePanel>
    </PageLayout>
  );
}
