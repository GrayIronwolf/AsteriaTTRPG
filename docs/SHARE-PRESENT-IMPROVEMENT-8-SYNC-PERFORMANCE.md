# Share & Present — Improvement Phase 8: Synchronization & Performance

**Branch:** `feature/share-present-improvement-8-sync-performance` stacked on draft Phase 7 PR #364. Prior Phases 1–7 remain unmerged and approval-gated. **No production deployment or merge.**

## Implementation

- Existing React/Vite `useCampaignStream` now treats authenticated API, campaign/map arguments, method and enabled state as a **strict subscription scope**. A changed scope renders empty/loading immediately; stale campaign/recipient media cannot persist for an effect-cleanup frame.
- Each subscription closes and clears its data on listener error, permission denial or invalid projection. Terminated subscriptions cannot overwrite later responses. Explicit cleanup handles a listener that fails during registration.
- Server-verified `watchPresentation` and `watchRestrictedViewer` scene snapshots use bounded revision guards: initial scene accepted; duplicate revision/identical payload skipped; lower revision rejected; changes to displayed content without revision advance fail closed; restricted viewers reset only after a different verified session epoch.
- Other small, already-projected Firestore callbacks skip identical render updates through a bounded in-memory signature. Collections above 32 records or payloads above the size budget bypass deduplication. No persistent cache, scene prefetch, direct Storage reuse or media-byte retention.
- Existing GM session/grant listeners now fail closed on stale cached snapshots rather than silently holding previous access status.
- Existing offline/background lifecycle, restricted invitation acceptance, audience-specific reveals, GM emergency stop, safe media-byte rules and explicit publish calls stay unchanged.

## Verification
- Phase 8 model tests cover duplicate callbacks, monotonic revisions, same-revision tampering, session epoch resets, scope isolation, safe error and cleanup behavior.
- Inherited Phases 1–7 regression tests plus Phase 5 and Phase 7 real Firestore emulator permission/expiry suites.
- React ESLint, Vite compile, checked website bundle and full repository integration workflows.
- Before approval, test multiple real devices and identities: rapid scene switching, blackout, GM emergency stop, account/campaign switch, background tab, offline/reconnect, expired invitation, revoked GM/player access, concurrent edits, and browser refresh.
- Measure real first-scene latency, update-to-display latency, memory use and active listener counts on the same devices before and after migration. **No measured speed-up is claimed from code/tests alone.**

## Constraints / known limits
- Revisions in separate independent feeds are not a single global clock. The service continues to authorize independent battle map, combat, media, character and per-recipient reveal reads.
- On revision rollback or same-revision conflicting scene data, the display stops until a user-initiated reconnect. There is no automatic unsafe retry.
- This is not an offline presentation feature. A disconnected projector intentionally hides approved content.
- Legitimate new scene revisions revalidate map/media authorization; no sensitive bytes are cached to make transitions faster.
- Earlier phase permission/asset confidentiality limitations still apply (including fog-only image secrecy), and must not be silently treated as fixed by synchronization improvements.
- Owner approval and browser-level acceptance must precede merge/deployment. Phase 9 remains separately approval-gated.
