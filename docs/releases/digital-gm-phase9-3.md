# Digital GM Phase 9.3 — Session Recording & Archives

## Delivered scope
- Explicit, per-session participant consent. The GM must acknowledge their own permission. Players and co-GMs must actively agree before recording starts. A refusal prevents recording.
- The GM captures only the selected local microphone or browser-tab audio using MediaRecorder. Tab capture requires browser permission and tab audio availability. No remote player's microphone is accessed automatically.
- Recording notices appear in the player Character Dashboard; the GM sees pending consent and recording status.
- Maximum 30-minute local clips. The user can export locally or optionally save to authenticated Firebase Storage. No automatic background recording, transcript generation or transcription service.
- Stored recordings are GM-private by default. The GM may explicitly publish or unpublish a completed archive, or archive/delete it.
- Each saved file is limited to 40 MB; per-campaign active archive limit is 25 files and total reserved storage is 250 MB. Archiving frees its quota even if Storage deletion later needs retry.
- Server-authoritative state and optimistic revisions; player consent is bound to the current request/session. Firestore and Storage rules block forged client writes.
- Existing sessions, notes, PDFs, combat systems and Phase 9.2 soundboard are not replaced.

## Important behavior and limitations
- This is **browser recording**, not a server-side recording of all campaign players or third-party voice services. The microphone option records only the GM's own microphone; tab audio records what the browser actually shares. It will not silently record everyone.
- Recording requires express participant permission and may be subject to laws governing recording and consent. Only record audio you have permission to capture and store.
- Browser support varies: microphone capture usually requires HTTPS, tab audio capture requires a browser that supports it, and browsers can block unsupported MIME formats.
- Recordings are processed temporarily in browser memory. Users must download or archive a finished clip before closing the tab. Cloud upload is optional; interrupted uploads remain GM-private pending archival.
- Soundboard audio and the recorded tab's sound are independent; adding a track to the soundboard does not automatically include it in recordings.
- No audio is placed into a public download URL. Storage reads are authenticated and tied to campaign roles and explicit publication. A copy already downloaded by a participant cannot be remotely revoked.
- Client-side MIME and audio magic checks do not replace antivirus or transcoding. Upload only recordings from a trusted device.

## Verification
1. Start a live campaign session as GM. Open **Session Recordings** and request consent.
2. Verify every player/co-GM sees the consent prompt on their Character Dashboard, even outside the recordings tab; decline should block the recording.
3. Once everyone agrees, start microphone recording and check the visible notice. Stop, play the result, download locally.
4. Save privately, refresh and play from the archive. Verify members cannot access it.
5. Publish the recording, confirm player playback. Unpublish and verify player Firestore and Storage access is revoked.
6. Delete an archive; ensure player access disappears and media cleanup succeeds.
7. Check invalid/oversize formats, active member restrictions, optimistic revisions and repeat requests.
8. Run the dedicated workflow verifying the new unit and emulator tests, earlier phases, dashboard regressions, lint and production build.

## Deployment after all three phases
With Phases 9.1, 9.2 and 9.3 merged and verified, run **Deploy Firebase backend (manual)** on main with operation `deploy` and confirmation `DEPLOY-ASTERIA-PRODUCTION` to publish Functions, Firestore and Storage rules. The website hosting bundle may require a separate publishing workflow. No new external provider, SMTP service, API key or paid recording service is needed.
