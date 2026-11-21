# Phase 7.7 — Share & Present Final Acceptance and Release Gate

**Status: Draft acceptance plan — not a production sign-off.**

This phase consolidates Phase 7.0–7.6's Media Library, private hybrid sessions, staged presentation media, live safe combat/maps, TV/projectors, reconnection, and GM-only local capture. It does not introduce remote desktop video, a second Firebase project, new server infrastructure, or a competing React presentation system.

## 1. Release prerequisites (all mandatory)

- [ ] All stacked Phase 6 and Phase 7 PR checks pass at their **actual merge candidates**, not only at the isolated Phase 7.7 head.
- [ ] The separate **Codex** React/Vite dashboard restoration is finished, reviewed and its source merged/reconciled with the stacked changes on a dedicated integration branch.
- [ ] There is no loss of **Phase 6** combat controls, draggable layouts, encounter preparation, GM/player dashboards, initiative, rewards, or historical data.
- [ ] Verify all Firestore and Storage rules from the candidate deployment. No browser write path may forge server-owned public projections or recipient grants.
- [ ] All findings from the authenticated two/three-account browser tests, permission emulators, accessibility and performance assessments are resolved or explicitly acknowledged by the owner.
- [ ] Written, explicit **owner approval** of final integration and deployment. **No merge or deployment** is authorised by Phase 7.7 alone.

## 2. Required authenticated browser matrix

Use a disposable Firebase emulator campaign (never production data), separate browser contexts with independent account sessions, and an accessible secure-context Chrome/Edge browser. Exercise all scenes with one **GM**, one **linked player**, one **invited viewer** who is not a campaign member, one **outsider**, and unauthenticated access. Capture timestamped results and screenshots for each resolution/device.

| Test | GM | Linked player | Invited viewer | Outsider/anonymous |
|---|---|---|---|---|
| Private media catalogue, raw maps/encounters, hidden fields | Allowed as GM | Denied | Denied | Denied |
| Published safe map and safe combat status | Select/operate | Safe view | Only currently staged eligible scene | Denied |
| Unpublished map and hidden enemy/resource fields | GM only | Denied | Denied | Denied |
| Authenticated image, muted looping video, PDF handout | Private preview | Approved shared assets | Only selected publication, grant, epoch and expiry | Denied |
| Set scene, publish, upload, blackout, grant/revoke | GM only | Denied | Denied | Denied |
| Local screen capture permission and preview | GM-only | No GM controls | No capture controls | No controls |
| Direct Firestore/Storage writes to projections/permissions | Denied from all browsers | Denied | Denied | Denied |

**Failure/recovery tests** — run independently while a published map or video is visible:
1. Close session; verify immediate blackout and no new Storage byte access. Start a new session with a different epoch; previous guest remains denied.
2. Revoke individual grant; confirm guest display closes and remote media bytes are denied on next request. Test expiry both while online and after dropping connection.
3. Remove media publication and fog/token visibility; confirm safe projection updates or blacks out. Never test with genuinely secret information baked into the original pixels: fog only hides a visual overlay.
4. Drop internet, switch tabs/background, refresh, restore bfcache, change accounts and switch campaigns. Verify no stale media is displayed while fresh permissions are unverified.
5. GM starts local capture, cancels permission, accepts, stops via browser chrome, closes the page, goes offline, and selects **Stop, Blackout & Revoke Viewers**. Verify local tracks are closed and server-side blackout/revocation outcomes independently.
6. Change turn order, move map tokens, update initiative, reveal a prepared wave, and end combat. Confirm invited viewers receive only current allowlisted projections.
7. Try forged requests or arbitrary map/media IDs; deny direct collection lists, source documents, writes, cross-campaign joins and stale sessions.

## 3. Visual, accessibility and performance acceptance

Test local display at **1920 × 1080**, desktop control at 1440 × 900, and a **390 px** mobile viewport; record screenshots and visual diffs after Codex restoration. Require readable map fog/grid overlays, no body horizontal overflow, and no GM dashboard or Combat Command Centre regression.

- Keyboard: visible focus, reachable buttons/selects, working fullscreen exit/Escape, no keyboard trap, announcement of permission error and connection loss using status/alert roles.
- Accessibility: headings, labelled video preview, announced blackout and revoked states, reduced-motion preference, adequate contrast and tap targets; record any exceptions rather than assuming compliance.
- Performance: measure browser LCP/initial display, scene-change latency, reconnect-to-authorised-scene time, listener count on repeated route changes, JS heap after 20 scene switches, and network bytes for image/video/PDF. Document actual device, network and measured numbers before claiming budgets were met.
- Suggested review targets only (not measured outcomes): reconnect to authorised scene under 5 s on stable broadband, ordinary scene change under 2 s, zero leaked snapshot subscriptions or unrevoked object URLs after teardown, zero GM secrets in restricted projections.
- Resource footprint: prevent new remote streaming libraries, media recordings or additional Firebase clients without separate sign-off.

## 4. Automated evidence and ownership

- Phase 7.7 model/privacy tests: `scripts/site-share-present-phase7-7.test.mjs`.
- Phase 7.7 cross-role Firebase emulator tests: `scripts/site-share-present-phase7-7-emulator.test.mjs` using `demo-asteria-share-present-phase77`.
- Phase 7.3/7.4 media and map emulator tests run with their original **matching project IDs**; never batch different project IDs under a single emulator invocation.
- Phase 6.4 two-account browser integration: `scripts/site-media-phase6-4-browser.cjs`. The blackout button locator is now scoped to the actual presentation controller, rather than matching multiple dashboard controls.
- The Phase 7.7 workflow runs Phase 6/7 model regression, role-based emulator permissions, lint, React checks, production build, and built-asset verification.
- Existing CI browser workflows are separate acceptance gates. Passing model/emulator tests is **not** proof of real 3-account browser rendering, permission UI, native capture dialog, pixel fog or weak-network behavior.

## 5. Outstanding sign-off record

| Gate | State | Evidence |
|---|---|---|
| Phase 7.7 tests & CI | Pending final head checks | GitHub Actions on Phase 7.7 draft PR |
| Existing Phase 6.4 two-account browser acceptance | Pending rerun of scoped selector | Phase 6.4 workflow |
| Three-account invited-viewer browser acceptance | Not yet verified | Capture real browser and screenshots |
| Cross-browser native capture permission and 390/1920 layouts | Not yet verified | Capture real browser and screenshots |
| Codex restoration source parity, UX, dashboards & performance | Blocked on Codex | Integration diff and user review |
| Final privacy and deployment owner approval | Not granted | Explicit user approval after evidence review |

**Release decision: HOLD. No merge, no production deployment, no claim that Phase 7 is complete until the outstanding gates are resolved.**
