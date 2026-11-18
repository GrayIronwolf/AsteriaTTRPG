# Phase 5.2 — React/Vite Campaign Forge

## Scope
Isolated React replacement for creating and managing an Asteria campaign with the existing Firebase services. No production deployment or legacy removal.

- Owner's saved campaign list, refresh, private details and settings
- Campaign creation with the existing authenticated `asteriaCampaignUCN` Cloud Function (12-digit permanent UCN, server-side collision and creation rate limits); no browser-generated identity
- Compatible campaign name, description, 1–12 party size, dashboard/inventory/spell/journal/quest/notes preferences, character creation/link permission settings
- Existing Firebase Storage artwork upload, replace and remove with 8 MB and image MIME limits
- Owner-only Firestore reads and transactional settings writes, with concurrency checks
- Existing campaign ownership, membership, GM/player roles, character links, invitations and gameplay data are unchanged by settings saves
- If server allocation succeeds but later profile configuration fails, the campaign is recoverable in the owner list; no duplicate UCN allocation or misleading rollback
- Existing v1 campaigns stay v1. The v2 membership creator remains canary-gated and is not silently activated

## Explicitly deferred to Phase 5.3
Invitation issuing/redemption, joining requests, membership approval/ownership transfer, co-GM roles, secure invitation links and character linking. GM Dashboard remains gated for Phase 6.

## Activation
The React Campaign Forge requires a verified Firebase account and the explicit build flag `VITE_ASTERIA_CAMPAIGN_FORGE_ENABLED=true`. Auth uses the same project and Firebase app created in Phase 4. No duplicate Firestore or auth instance.

## Verification
`scripts/site-campaign-phase5-2.test.mjs`: schema preservation, editable-field allowlist, UCN rules, owner verification, protected routing and default privacy.
`scripts/site-campaign-browser.cjs`: Auth/Firestore/Functions emulator campaign creation, save, edit, persistence, account isolation and mobile overflow. Existing website and Firebase checks remain mandatory.
