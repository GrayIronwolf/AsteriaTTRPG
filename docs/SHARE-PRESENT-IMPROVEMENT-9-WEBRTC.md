# Share & Present — Improvement Phase 9: Optional One-to-One WebRTC Remote Screen Sharing

**Branch:** `feature/share-present-improvement-9-webrtc-screen-share` stacked on Phase 8 PR #365; prior Phases 1–8 are separate approval-gated drafts. **Do not merge or deploy without explicit owner approval and full acceptance.**

## Delivered
- Explicit GM **Share Selected Screen** and recipient **Join Live Screen** actions. Browser permission via `getDisplayMedia({video:true,audio:false})` is required for every new share. This is a separate option alongside the existing scene-based presentation; no recording, video storage, audio capture, camera, or automatic sharing.
- One GM → one specifically accepted restricted viewer at a time. GM choice is limited to active grants in the current campaign/session. The existing `asteriaAction` and Cloud Function perform GM and recipient authorization. The viewer answer binds to its own authenticated Firebase UID, not a caller-supplied recipient.
- Firestore stores only short-lived video-only offer/answer SDP, under `campaigns/{id}/presentationScreenShares/{viewerUid}`. Write operations are Cloud Function-only. Rules allow the GM and the exact active accepted recipient to read their signaling record, with session epoch, connection ID and expiry checks. All client writes and all list queries are forbidden.
- One active screen-sharing pointer per hybrid session prevents concurrent shares. Server stops and viewer departures release it; emergency stop, GM closing the session and revocation clear it as well. A stale stop cannot end a newer connection.
- SDP exchange is **non-trickle**: ICE candidates are gathered before the existing callable writes the offer/answer. No new Cloud Run service, database, signaling server or backend project.
- Local capture/peer connection stop when the GM stops, the track ends, emergency stop is activated, a tab becomes hidden, a page closes, the client goes offline or permissions are revoked. The viewer must opt in and can leave at any time.
- A single offer expires after the earlier of the viewer grant, hybrid session expiry and **20 minutes** from initiation. No automatic renewal.
- Built-in WebRTC peer-to-peer connectivity has **no configured TURN relay**. Users may opt into Google's public STUN server to discover network connectivity; this can disclose network IP addresses to that service. Video may fail across some NAT/firewall combinations. No reliability or quality claim before real remote-device acceptance.
- WebRTC transport provides media encryption in modern browsers. The other participant can view captured pixels and may make their own recording; screen selection and browser sharing indicators are critical safety boundaries.

## Required QA before approval
- Unit tests: video-only SDP allowlist; no audio/data channels; stale offer/answer rejection; one active UID; authentication; expiry, stop, close, session epoch and emergency state.
- Firestore emulator: exact invited viewer may read their own offer/answer only; others, pending viewers and anonymous clients cannot; SDP client writes are always denied, including GM writes.
- Inherited Phases 1–8 regressions, React lint/build and final repository-wide workflows.
- Live signed-in GM and distinct invited viewer sessions, across the same network and two different networks: screen permission denied, offer/answer, actual video track displayed, browser resize, app background, account change, offline, connection failure, viewer decline, expired invitation, GM revoke, remote exit, and emergency stop.
- Verify no WebRTC signaling appears in public `presentationShared`/`presentationRestricted` projections, media Storage, notifications, server logs, or browser localStorage. Run performance and manual security review of SDP and ICE candidate address disclosure.
- Confirm the always-visible Phase 1 emergency button halts the local capture synchronously; a server error must clearly state remote revocation is unconfirmed.
- Measure actual remote connection rate, initial connection time and sustained video quality. Static tests do **not** prove remote streaming works across browsers or networks.

## Limits
- Exactly one GM screen to one accepted restricted viewer, not an audience broadcast, SFU, conference call, remote desktop control, audio/video chat or persistent recording.
- The screen-share offer does not change what the existing GM-published scene shows to other users. Permission to view a scene does not itself authorize screen-sharing access.
- Absent a TURN relay, many internet-to-internet connections will fail even with STUN enabled; no new third-party infrastructure has been installed.
- Screenshare signaling records remain in Firestore after termination in a stopped state until explicitly cleared by future retention maintenance; access rules prevent old records from being readable by revoked viewers.
- Security review must include SDP network metadata exposure and whether allowing the selected viewer's UID in the existing hybrid session control is acceptable.
- Production deploy and merge require separate owner approval, multi-device browser acceptance and reconciliation with the Codex restoration process.
