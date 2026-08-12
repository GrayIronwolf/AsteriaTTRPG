async function loadEntry() {
  const localFixture = ['127.0.0.1', 'localhost'].includes(window.location.hostname) &&
    new URLSearchParams(window.location.search).get('reactFixture') === '1';
  if(localFixture) {
    const { installDevFixtures } = await import('./devFixtures.js');
    installDevFixtures();
  }
  if(import.meta.env?.DEV) {
    if(!localFixture) {
      const { installDevFixtures } = await import('./devFixtures.js');
      installDevFixtures();
    }
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
