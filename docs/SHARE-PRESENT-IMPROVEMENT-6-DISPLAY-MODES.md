# Share & Present — Improvement 6: Dedicated Display Modes

**Stacked branch:** `feature/share-present-improvement-6-display-modes` is based on Phase 5 PR #362. All earlier Improvement PRs remain drafts and require separate owner approval. **No merge or deployment.**

## Delivered
- Four fixed **viewer-side, local** display presets: Tabletop TV, Projector, Remote Desktop and Mobile Player. The controls are shared by the existing authenticated player projector and restricted invitation display, not a second presentation backend.
- Each viewer can adjust bounded stage scaling (75%–150%), a non-sensitive display status overlay and clean fullscreen behavior. Presets use default font scaling appropriate to the chosen screen; the local viewer can override it.
- Display preferences are stored as allowlisted geometry/UI choices in this browser's localStorage, scoped to the verified signed-in UID, campaign ID and member/restricted viewer role. **No scene content, private notes, media bytes, credentials or access tokens are saved.**
- Clean fullscreen hides header/toolbar distractions but always supplies an explicit Exit Fullscreen button. ESC also remains browser-supported. Connection errors remain visible.
- Offline and background-tab lifecycle still unmounts the player or restricted stage. Reconnection uses the existing server-validated Firestore media and grant checks, never cached authorizations.
- Existing GM emergency-stop, invitation acceptance/revocation, preview, prepared encounter and playlist systems are untouched.

## Security and acceptance
- Display modes are purely visual: they never publish scenes, grant viewers, alter session epochs or bypass Firebase security rules.
- Restricted viewers continue to receive only the sanitized publication projection; every media byte request still requires appropriate server-side authorization.
- Tests cover strict preference validation, account/scope isolation, unknown scene labels, display route integration and existing offline/reconnect/7.7 privacy controls.
- Run inherited Phase 1–5 tests, invited-recipient Firebase emulator tests, React/Vite lint/build and final repository-wide CI.
- Manual two-account, multi-screen acceptance: switch all four presets on a television, computer projector, desktop browser and mobile browser; verify scaling, aspect ratio and screen overflow, focus/keyboard navigation, fullscreen exit, blackout, revoked-grant fadeout, reconnection and cross-tab behavior.
- Verify local preferences are not mistaken for a GM-issued command or synchronized between players. Existing scene and accessibility issues must be recorded, not silently ignored.

## Known limits
- Presets are **per-device local viewer preferences**, not a GM-managed remote layout or simultaneous synchronized multi-screen arrangement.
- This phase does not add WebRTC, media casting, device pairing or a second authenticated viewer transport.
- Scaling uses CSS visual zoom. Physical projector and mobile devices require browser acceptance for cropping/scrolling and video fit; source-based tests cannot establish that.
- A player with access sees only authorized scenes; preset selection does not relax any GM-private restrictions.

**Release gate:** Separate explicit owner approval and completed checks before any merge, deployment or Phase 7.
