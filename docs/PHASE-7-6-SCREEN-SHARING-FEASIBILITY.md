# Phase 7.6 — Screen capture, consent, and remote transport gate

## Delivered (local only)
- The existing GM presentation controller includes an explicit **Choose Screen to Preview** control. Browser permission is requested only in direct response to that click, through `navigator.mediaDevices.getDisplayMedia({video:true,audio:false})`.
- The selected browser tab/window/screen is displayed inside a **GM-private, muted local video**. The stream stays in browser memory; there is no recording, Storage upload, Firestore payload, WebRTC peer connection, public URL, or invitation-based stream.
- Stop Local Preview tears down every captured track and clears the local `video.srcObject`. The browser share-stop action triggers the same cleanup through the track `ended` event. Leaving the page, closing the tab, going offline, hiding the GM tab, changing campaign or unmounting the controller also tears down the stream.
- **Stop, Blackout & Revoke Viewers** first stops capture, then calls the existing authenticated GM presentation blackout command and ends the existing restricted viewer session (which revokes its grants). Failure of either remote command is reported; the UI never asserts remote revocation succeeded on an unsuccessful request.
- This controller is accessible only via the existing GM campaign presentation workspace; remote restricted views never mount it.

## What this does *not* deliver
- Capturing the GM desktop does **not** send a live video stream to a player, second browser tab, separate device or remote viewer. A physical TV connected to the GM device can show the GM's local preview via operating-system display mirroring; the existing authenticated Player Display is the supported private second-screen experience.
- An existing Firebase synchronised scene can mirror **Asteria-approved media/map/combat scene state**, not arbitrary live desktop pixels.
- No promise of retroactive deletion of screen pixels copied or recorded by a recipient. The user should avoid including secret desktop notifications and private windows in captured content.

## Approval gate: remote desktop video
An actual remote desktop-video broadcast requires explicit owner approval and a separate reviewed design for:
1. A recipient-specific, revocable session and consent protocol with both GM and viewer identities, scoped to the already-approved hybrid session.
2. WebRTC signaling/authentication, ICE, NAT and TURN relay feasibility, and bandwidth/availability/cost. A Firebase document alone is not a video transport; public STUN cannot guarantee connection.
3. A server-enforced participant join and disconnect model, safe defaults for audio, start/stop indicators, limits on track recording/copying claims, and the actual effect of revocation on established peer connections.
4. Multiple-account and multi-device tests including abrupt network loss, stopped tracks, tab closure, expired grants, session rotation and unauthorized viewers.
5. Whether an additional transport service is unavoidable. No infrastructure may be added without owner review.

## Compatibility and acceptance
- No new Firebase project, paid service or third-party transport.
- Phase 7.5 projector, React/Vite dashboard restoration and Phase 6 combat permissions must remain intact.
- Check Phase 7.5 inherited CI (including the separately ordered 7.3/7.4 emulator suites), Phase 7.6 tests, lint, React source/build and dist.
- Manual secure-context browser tests are required in Chrome/Edge with real GM sign-in: approve/cancel browser permission, stop from browser chrome, tab/campaign/account switch, offline, emergency blackout and grant revocation.
- Phase 7.6 remains draft; **no merge/deploy until Codex restoration, full reconciliation, authenticated acceptance and explicit owner approval.**
