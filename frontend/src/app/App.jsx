import React from 'react';
import { SiteShell } from '../components/SiteShell.jsx';
import { HomePage } from '../pages/HomePage.jsx';

// Phase 1.1: a single React root and shell. Route ownership arrives in Phase 1.2.
export function App() {
  return (
    <SiteShell>
      <HomePage />
    </SiteShell>
  );
}
