# Milestone 2.5 — Canvas Integration, Performance and Final Polish

Branch: `milestone-2-5-canvas-integration`; only merge target: `Website-Build-Test`.

Dependency chain: verified Milestone 2.3 / PR #389 → verified Milestone 2.4 / PR #390 → this milestone. The user authorised implementing 2.4 and 2.5 in the same work session. Their PRs remain separate. Merges must wait for manual Pages publishing: the existing target-branch publishing source automatically deploys the live domain, which this task prohibits.

## Architecture audit and corrections

All three dashboards already use the same canvas/model; no replacement canvas or gameplay/persistence layer was added. Retain the existing owner-scoped GM and Player Firebase save queues and device-local Combat layout. Correct these integration defects in that code:

- Required visible Player windows could reject movement because an old hidden flag remained in saved preferences. Drag, resize, docking, snapping and collision checks now use the actually rendered, allowlisted windows. Suppressed/private panels cannot obstruct visible windows. Saved visibility preferences are preserved.
- An older async save could show a stale error or restore an obsolete optimistic layout. Track confirmed preferences, pending writes and the latest completion in the shared component; ignore old-account/campaign/unmounted completions. A failed latest batch restores the last confirmed layout and clears unconfirmed undo/redo history. Remote acknowledgements cannot overwrite a newer pending edit.
- GM saves maintained a second optimistic layout in the parent and cleared the busy flag after the first of several queued writes. Remove that duplicate optimistic update, keep the parent document confirmed, and retain the busy/Focus guard until the existing queue is empty. The latest completion owns error presentation. Invalidate the GM save scope when its subscription is disposed.
- Wheel and global pointer listeners no longer rebind on every layout/render update. Dispatch through current refs; content-size observation reconnects only for meaningful sizing/visibility changes. Cancel frames, timers and captured pointers on cleanup/context change. Permission/visibility changes and settings/history commands cancel incompatible active gestures.
- Complete a pending wheel debounce before starting a drag, preventing its late state update from interrupting an active geometry gesture. Keep 2.2 animation-frame batching and compositor moves. Reduce expensive window shadows/guide filters during active interactions when the existing reduced-effects preference is enabled; content stays opaque and interactive.
- Use the existing Obsidian/global panel backdrop and bezel consistently. Remove the hardcoded content background that hid theme alternatives. Existing special dice/tray shapes keep their own interactive renderer and are not converted to canvas geometry.
- The optional window switcher could cover a focused Player window's options. Collapse its search/results after selection, with a compact reopen control inside that existing optional switcher. Keep the approved seven-button toolbar and the saved switcher preference unchanged.

## Dashboard and gameplay integration

GM, Player and Combat window registries, private-information suppression, owner/GM inspection permissions and existing service APIs remain authoritative. No new panel permissions or gameplay authority was introduced. Map/encounter/dice actions remain in their existing components; layout writes contain only presentation preferences.

The browser fixture lacked the existing dice/audio/calendar APIs, so opening every optional panel hit the application's error boundary. Extend only the loopback fixture with isolated streams and a deterministic dice response through the existing dice model. Track fixture subscription disposal and roll requests. No production service method, rules file or backend callable was replaced.

Browser integration exercises window creation/removal and restoration with all authorised panels open; Calendar/Weather routes and subscription disposal; minimise/restore; combat select/checkbox controls while locked; a single private dice request while locked; and dice/audio cleanup when leaving the canvas. The existing browser baseline additionally covers resource cards, player management, encounter controls, map display, dashboard menus and smaller viewports. The dedicated physical-dice CI workflow covers real pointer physics separately from the shared-canvas reduced-motion roll acceptance.

## Verification

- ESLint, production build, repeat-build asset consistency and committed generated chunks.
- Full application suite, Firebase Auth/Firestore/Storage emulator suite, dashboard/combat/data-sync regressions, release source, production dependency audit at existing thresholds, coordinated campaign/content checks and XP realtime sync.
- Behavioural runtime tests execute real JSX handlers and the real GM save callback: all resize edges/zooms/roles, frame batching, listener identity/cleanup, read-only interaction, required-panel movement, Escape/lock cancellation, context changes, latest/older save failures, queue sequencing and wheel-to-drag isolation.
- Model checks retain role allowlists/locks and include required/suppressed neighbour collision handling.
- Chromium: all nine GM/Player/Combat × 50/75/100% sizing/navigation cases, plus the three role-specific integration cases and the existing 14-scenario baseline. Assertions wait for observable camera results rather than assuming a fixed number of frames completes React rendering.
- GitHub Actions results are recorded on the PR and must all pass before merging.

No Firebase Functions, Firestore/Storage rules, collection paths or data schemas changed. No backend deployment or migration is required. No live deployment is authorised or performed. Browser touch/trackpad acceptance is emulated; physical-device QA and production account sessions are outside these isolated checks. No FPS or long-session hardware benchmark is claimed.
