# Share & Present — Improvement Phase 7: Audience-Specific Reveals

**Stack:** Branch `feature/share-present-improvement-7-audience-reveals` is based on draft Phase 6 PR #363; earlier improvement PRs remain separate and unmerged. Do not merge or deploy before owner approval, final checks and Codex restoration reconciliation.

## Implemented
- GM-only text reveal composer with exact authenticated UID targeting: active campaign **member** or accepted **restricted viewer**. Restricted viewer UIDs may be picked from accepted invitation grants. No new infrastructure or alternative presentation backend.
- Each recipient has one current text reveal document per audience at `campaigns/{id}/presentationAudienceReveals/{audience}_{uid}`. Strict allowlists cap titles to 120 and body text to 380 characters, exclude file references and any arbitrary GM data.
- Existing `asteriaAction` callable verifies GM privileges; confirms active target membership or accepted viewer grant, current session epoch and exact current published scene revision, then writes the recipient-bound text in one transaction.
- Per-recipient Firestore rules enforce **GET-only** for the exact account UID, active member/grant, audience, live nonblackout scene, matching revision and matching restricted-viewer epoch. No client writes; other users cannot list recipients. The GM can list and clear recipients individually.
- Both existing React/Vite player and restricted displays mount their own, server-authorized reveal feed only inside an approved, online presentation stage. Scene mismatch, blackout, expiry, membership loss, account switch, stale cache and revocation hide the reveal.
- Nothing is added to the public `presentationShared` or global `presentationRestricted` text projection. Existing emergency stop, playlist, prepared encounters, invitations and display modes are reused.

## Required acceptance and limits
- Unit/CI and real Firestore emulator tests cover cross-UID isolation, stale scene revisions, blackout, session epoch mismatch, revoked/expired restricted grants, inactive membership, unauthorized writes and GM-only calls.
- Real-account, cross-device two-player and one-guest browser verification must confirm the correct UID sees only their own reveal; an unrelated signed-in account sees none; offline and emergency-stop disconnects remove content.
- A targeted reveal is **text only**. It is not a privileged asset-sharing API and does not create new Storage access. Media files/handouts and masked maps require future dedicated per-user byte authorization and confidentiality review.
- The GM must deliberately enter the text to reveal; the server cannot determine whether typed narrative itself contains spoilers.
- Old reveal documents remain stored until cleared, but stop being readable when the scene revision changes, the session closes or the audience loses its permissions. To prevent stale data growth, the GM should clear unused entries; cleanup can be a later maintenance enhancement.
- The existing broad player scene remains available to authorized members; this phase provides independent targeted text overlays rather than changing global publication rules.
- Final checks, permissioned browser tests and owner approval are required before merge/deploy or Phase 8.
