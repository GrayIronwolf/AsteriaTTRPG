async function loadEntry() {
  if(import.meta.env?.DEV) {
    const { installDevFixtures } = await import('./devFixtures.js');
    installDevFixtures();
    return import('./main.jsx');
  }
  return import('../react-dist/asteria-react.js?v=react-m1');
}

loadEntry().catch(error => {
  console.warn('Asteria React dashboard bundle is unavailable. Static fallback remains active.', error);
  window.AsteriaReactMigration = Object.assign(window.AsteriaReactMigration || {}, {
    available: false,
    error
  });
});
