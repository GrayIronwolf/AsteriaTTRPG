/* Phase 3.1: read-only campaign discovery and preview validation.
 * This has no access to membership writes, character linking or invitations.
 * The Cloud Function remains authoritative for real campaign discovery.
 */
(function () {
  'use strict';

  function normalizeUCN(value) {
    if (typeof value !== 'string') return '';
    const raw=value.trim();
    if (!/^[0-9\s-]+$/.test(raw)) return '';
    const code=raw.replace(/[\s-]/g,'');
    return /^\d{12}$/.test(code) ? code : '';
  }

  function verifiedPreview(payload, expectedUCN) {
    if (!payload || typeof payload !== 'object' ||
      typeof payload.id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(payload.id) ||
      typeof payload.name !== 'string' || !payload.name.trim() ||
      payload.ucn !== expectedUCN || !normalizeUCN(expectedUCN)) return null;
    const joinMode=['legacy','legacy-compatibility','request'].includes(payload.joinMode)
      ? payload.joinMode : 'unavailable';
    return Object.freeze({
      id:payload.id,
      name:payload.name.trim().slice(0,120),
      ucn:expectedUCN,
      joinMode
    });
  }

  function joinAccountValid(account, activeUser) {
    return Boolean(account && activeUser &&
      typeof account.uid === 'string' && account.uid.length > 0 &&
      typeof activeUser.uid === 'string' && activeUser.uid === account.uid);
  }

  function canJoinPreview(preview, account, activeUser, typedCode) {
    return Boolean(preview && joinAccountValid(account,activeUser) &&
      normalizeUCN(typedCode) === preview.ucn &&
      (preview.joinMode === 'legacy' || preview.joinMode === 'legacy-compatibility'));
  }

  const model=Object.freeze({
    normalizeUCN,verifiedPreview,joinAccountValid,canJoinPreview
  });
  if (typeof window !== 'undefined') window.AsteriaCampaignJoinModel=model;
  if (typeof module !== 'undefined' && module.exports) module.exports=model;
})();
