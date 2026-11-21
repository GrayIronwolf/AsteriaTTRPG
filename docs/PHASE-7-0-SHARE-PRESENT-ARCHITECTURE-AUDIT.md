# Asteria TTRPG — Phase 7.0: Share & Present Architecture Audit

**Date:** 21 November 2026  
**Source baseline:** Phase 6.9 draft PR #349, head `b485bd97aeb22776b9a4f6a131926756df64a8fe`  
**Delivery:** Audit / acceptance gates only; no production feature changes, merge or deployment  
**Integration freeze:** Continue Phase 7 on stacked draft branches while Codex restores the React/Vite dashboards. Reconcile with the restored source and seek explicit owner approval before any merge to `main` or release.

## 1. Locked Phase 7 scope

Phase 7 is **Share & Present / Player Display and Second-Screen System**, not another combat engine. Phase 6 owns prepared encounters, battle-map combat and live encounter management.

| Phase | Delivery | Acceptance boundary |
|---|---|---|
| **7.0** | Architecture, existing-code inventory, permissions and migration audit | Written findings, baseline tests and review gates; no silent feature rollout |
| **7.1** | Unified Media Library and content classification | Index existing media without copying binary assets or creating a competing library |
| **7.2** | Hybrid Session Manager, participant roster, selected recipients and access grants | Authenticated GM ownership, revocation, expiry, no public unscoped links |
| **7.3** | Media uploads, scene types, handouts, temporary and permanent sharing | Validated files, GM review, recipient/expiry checks at both metadata and blob layers |
| **7.4** | Live battle-map, encounter and presentation integration | Server-safe player projection, fog/tokens, no GM-only data in player-readable records |
| **7.5** | Local TV/projector, second-screen and secure online viewer | Fullscreen, remote join/rejoin, controlled blackout, reliable disconnect handling |
| **7.6** | Screen-sharing and display controls | Browser permission/consent, preview, stop/revoke, controlled audience, transport feasibility |
| **7.7** | End-to-end browser, emulator, privacy, accessibility and performance acceptance | GM/player/remote viewer testing on multiple devices; no regressions to Phase 6 |

## 2. Reusable implementation already present (do not duplicate)

| Capability | Authoritative source | Current finding |
|---|---|---|
| Route and activation boundary | `frontend/src/router/siteRoutes.mjs`, `frontend/src/app/featureRegistry.mjs`, `frontend/src/pages/PresentationPage.jsx` | `#/react/presentation/{campaignId}` routes to a signed-in presentation page behind the existing media adapter |
| Presenter and second-screen UI | `frontend/src/dashboard/CampaignPresentationWorkspace.jsx` | GM scene/blackout controller plus signed-in fullscreen viewer; supports `blank`, `title`, `announcement`, `battle-map`, `world-map`, `combat`, `party` |
| Scene schema / safe display helpers | `src/state/playerPresentationModel.mjs` | Allowlisted scene fields, revisions, limited combat and party projections; preserve these validations |
| Canonical presentation command | `functions/playerPresentationCommands.mjs` | Authenticated GM-only, transaction-based scene publication to private control and shared projection; revision checked |
| Media client service | `frontend/src/dashboard/firebaseCampaignMediaService.mjs` | Injected single Firebase instance; authenticated campaign access; listening to presentation/maps/atlas/party/encounter; map and atlas blob fetch |
| Existing battle maps | `frontend/src/dashboard/CampaignMapWorkspace.jsx`, `src/state/battleMapModel.mjs` | Player-visible map display including images, looping videos, grid, fog and tokens; authenticated Storage reads |
| World Atlas | `src/state/worldAtlasModel.mjs`, `functions/worldAtlasCommands.mjs` | Published world maps and player-safe metadata already exist |
| Campaign PDF handouts | `src/state/sessionLibraryModel.mjs`, `functions/sessionLibraryCommands.mjs` | GM-private session notes and separately published PDF handouts; maximum 60 PDFs |
| Campaign audio | `src/state/campaignAudioModel.mjs`, `functions/campaignAudioCommands.mjs` | Private audio tracks, GM publication, player opt-in audio, existing live cues; maximum 40 tracks |
| Recording and consent | `src/state/sessionRecordingModel.mjs`, `functions/sessionRecordingCommands.mjs` | Existing browser capture/recording concerns; **not** a live screen-stream transport |
| GM/Player navigation | `frontend/src/pages/GMDashboardPage.jsx`, `frontend/src/pages/PlayerDashboardPage.jsx` | Existing Player Display, Session Library, Battle Maps, Atlas, Audio and related tabs; reuse instead of another parallel navigation stack |
| Firebase setup and access | `frontend/src/firebase/firebaseRuntime.mjs`, `frontend/src/firebase/firebaseClientAdapters.mjs` | One Firebase Auth/Firestore/Functions/Storage setup; no new Firebase project or auxiliary infrastructure |
| Document and Storage security | `firestore.rules`, `storage.rules` | Private control versus shared presentation, explicit published asset rules; must expand for selected recipients and time limits |

**Technical design:** React/Vite client → existing injected domain services → signed-in membership and link checks → canonical Firebase callable for all authoritative changes → GM-private Firestore records plus independently verified viewer-safe projections → existing Storage objects. No legacy CSS/JS overlay and no second Firebase service.

## 3. Findings, gaps and priorities

**P0 — Raw encounter data boundary (must resolve before 7.4 or guest viewing).**  
`firestore.rules` currently lets active campaign members read `campaigns/{campaignId}/systems/encounter` through the general `systems/{systemId}` rule. The combat and presentation React clients retrieve this raw document and then hide enemy information in `projectCombat` or `safeCombatPresentation`. **Client-side projection does not prevent a reader from inspecting the underlying allowed Firestore document.** Audit actual encounter fields in the authenticated emulator and implement a separate server-produced, allowlisted player-facing combat/presentation record before releasing secret-sensitive remote presentation features. Keep GM gameplay controls and detailed enemy state in GM-only records. This may require an agreed migration of existing player listeners; never simply deny a document without replacing dependent reads.

**P0 — Viewer targeting and revocation absent.**  
Existing `presentationShared/current` is readable by all active campaign members; it has no per-recipient allowlist, guest grant, time window or forced dismissal semantics. Phase 7.2 must introduce server-authoritative audience state and security rules covering exact recipients, time bounds, revoked roles and terminated sessions. Player accounts and invited remote viewers must never be treated as GMs.

**P0 — Bytes and metadata must share the same permission decision.**  
Existing maps, PDFs, audio and atlas objects use separate published-read rules. Phase 7 time-limited/recipient-limited sharing requires an equivalent Storage authorization gate (or a server-mediated read) rather than merely hiding file tiles in React. A cached blob already delivered to a device cannot be un-downloaded; never promise retrospective erasure.

**P1 — Media exists in several libraries, not one classified index.**  
Build a virtual index referencing existing map/atlas/PDF/audio/recording object IDs and paths; do **not** duplicate blobs or recreate upload handlers. Keep distinct public/private metadata and per-type limits. Artwork and personal galleries are not automatically safe for handout sharing; they require explicit consent/publication policy.

**P1 — Missing scenes.**  
Current projector supports seven scene types and full-screen. Cinematic images/videos, handout and gallery scenes, view transitions, temporary viewer-specific shares and hybrid audience controls need implementation. Reuse the existing scene command with a backwards-compatible versioned schema and strict unknown-field rejection.

**P1 — Second-screen / online viewer.**  
Current route requires a signed-in campaign account. It is useful for a local display signed in as an authorised account, but is **not** a secure guest viewer system. Do not generate publicly readable invitation URLs. A remote viewer must use a verifiable, explicitly approved, narrow-scope access route with expiry/revocation; guest authentication prerequisites require design/proof before enabling.

**P1 — Live screen sharing is not provided by PDF/audio recording.**  
Local browser/OS screen mirroring and a Firebase-synchronised scene are possible without a new service. Browser `getDisplayMedia` requires explicit interaction/permission; its video stream is not magically delivered to remote viewers. If remote live screen video is required, a WebRTC signaling, consent, transport and TURN/NAT feasibility review is needed. Do not silently add a paid video relay or assume reliable internet traversal without it. Ensure the GM can preview, stop sharing and immediately revoke new viewer access.

**P1 — Phase 6 integration risk.**  
Phase 6.6–6.9 are stacked draft PRs; Phase 7.0 is based on #349, not `main`. No merge into Codex-restoring dashboard routes; preserve Combat Command Centre drag/resize, map token state, restored dashboard panel layout and existing navigation during final integration.

**P2 — Performance and browser support.**  
Bound listeners/media previews, unload old object URLs, release media tracks and stale subscription handles on account/campaign changes, and test 390px mobile, desktop and 1920x1080 projector. Validate map/video behaviour on weak connections; no autoplay audio without consent.

## 4. Proposed ownership and data boundaries

| Data / actor | GM | Linked player | Invited viewer (future) |
|---|---|---|---|
| Private GM workspace, scene drafting, enemy stats, hidden map notes | Allowed by campaign GM rules | Deny | Deny |
| Approved scene descriptor | Read/control | Read if campaign member | Read **only** through validated viewer grant |
| Published map, atlas, handout, audio bytes | Read with own GM permissions | Read under existing publication policy | Selected published asset only, grant/expiry checked at byte access |
| Private session or player journals | As specifically authorised by preexisting system | Own data only | Deny |
| GM control / upload / visibility / blackout | Authoritative callable and revision | Deny | Deny |
| Live screen-share capture | Host-initiated with browser consent | Only if explicitly asked to share own content | Receive only approved stream; no capture controls |

**Approval model:** GM chooses a media source, exact audience and temporary/permanent duration; server validates membership and document state; one immutable sharing decision and public projection are published; revocation terminates future reads and subscriptions. Do not mistake UI visibility for Firestore or Storage authorization. Keep audit receipts for publish/revoke, and fail closed if membership or live session is lost.

**Media taxonomy for 7.1:** `battle-map`, `atlas-map`, `image`, `video-cinematic`, `pdf-handout`, `audio`, `recording`, `scene`. These are classification labels over existing assets, **not** additional duplicated Storage locations. New uploads of genuinely new types are deferred to 7.3.

## 5. Ordered implementation gates

1. **7.0:** Finish this audit and automated baseline contracts. Do not treat an audit as proof of authenticated end-to-end presentation security.
2. **7.1:** Index existing assets, categories, provenance, preview and source-of-truth, with no automatic publish. Unit tests on source pointer validation and privacy.
3. **7.2:** GM/remote hybrid session state machine and server-validated viewer grants, recipient lists and expiry. Firestore/Storage emulator permission tests **before** accepting guests.
4. **7.3:** Typed media upload paths, scene metadata, GM preview, publish and temporary/permanent handouts; enforce size/content-type/path/revision rules.
5. **7.4:** Source-of-truth encounter/map adapters, safe server-projected combat data, fog/tokens/scene sync; prove non-exposure of GM fields in raw client-readable documents.
6. **7.5:** TV/projector fullscreen controls and secure online viewer, reconnect/blackout/closed session/rotation tests.
7. **7.6:** Screen sharing preview, consent and stop/revoke, with explicit feasibility gate for any remote video transport. No unapproved external infrastructure.
8. **7.7:** Multi-device + two-account + limited-viewer authenticated tests, rules-emulator denials, performance budgets, visual parity after Codex, app build and regression checks.

**Phase completion criteria:** Automated checks pass for the current branch; critical permissions are verified in emulator and authenticated role tests; no Phase 6 regression; user reviews and approves progression to next phase. **No merge or deployment** until the separate Codex React/Vite restoration is complete and reconciled with these changes.

## 6. Tracking and open decisions (not license to silently broaden scope)

- **G0 blocker:** Confirm all fields in the raw shared combat record before deciding whether to split authoritative state and player-safe projections. Existing Phase 6 combat listeners rely on the current read contract.
- **G1:** Guest viewer identity mechanism, max devices and session lifetime: determine from the existing Firebase Auth capabilities and explicit GM approval. Never default to anonymous public access.
- **G2:** Temporary versus permanent sharing: define retention, expiry and revoke behaviour for bytes and already-open viewers.
- **G3:** Remote *video stream* versus remotely synchronised Asteria scenes: choose transport only after feasibility/security testing, not by adding a service automatically.
- **G4:** Approval needed to activate each phase and for final Codex-integrated merge/deployment.

## 7. Phase 7.0 evidence and acceptance

- Inspected current React presentation controller/route and actual Firebase presentation commands and rules.
- Inspected battle maps, world atlas, session PDFs, audio and recording integration points.
- Verified that Phase 6.9's four commit-specific workflow runs succeeded before branching Phase 7.
- Baseline tests in `scripts/site-share-present-phase7-0.test.mjs` document existing safe-presentation contracts and regression gates. They do not claim to test planned future guest/media functionality.
- Report blockers are explicit; 7.0 does **not** make remote viewing or screen sharing production-ready.
