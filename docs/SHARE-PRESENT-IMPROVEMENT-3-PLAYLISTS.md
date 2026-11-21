# Share & Present — Improvement 3: Scene Playlists & Quick Transitions

**Stack:** Improvement 3 is based on draft Phase 2 PR #359, which is based on Phase 1 PR #358. **Do not merge or deploy until owner approval and Codex dashboard restoration reconciliation.**

## Delivered
- A bounded playlist library per campaign in `campaigns/{id}/presentationPlaylists/current`: up to 8 playlists, each with up to 12 ordered, named scene drafts.
- GM-only server-authorized Firebase action `managePresentationPlaylist`; transaction revision checks protect against stale concurrent updates. Firestore rules allow only GM reads; all browser writes forbidden.
- Existing React/Vite GM Presentation Controller retains the only scene publishing path. Scene playback calls `api.managePresentation` with a fresh expected revision and server-side media/map access checks; it does not publish directly via Firestore.
- GM playlist editor supports create, rename, add staged scene, reorder, remove, save, delete, stage privately, present selected scene, present previous and present next.
- No autoplay, timed publication, WebRTC, new Firebase project, or unapproved media exposure. Emergency Stop remains independently available above the workspace.
- Playlist data is private to the campaign GM; it is never copied into player-visible presentation projections.

## Verification and release gates
- Phase 3 plus inherited Phase 1/2/7.7 model tests; Firebase rule emulator suite; React ESLint and build verification.
- Verify two account roles in actual browser sessions. Player and invited guest cannot read `presentationPlaylists/current` or call playlist management.
- Verify missing/unpublished assets are rejected during Present, stale revisions fail safely, staged-only scenes do not change player display, emergency stop immediately blacks out current scene, and next/previous never auto advances.
- Test offline, dropped listeners, reconnected viewers, and moving through scenes after a simultaneous GM edit.
- All repository CI jobs and source-matched tracked bundles must pass on the final draft head. Do not merge into `main` or deploy without owner approval.

## Limitations
- A playlist stores scene settings, not copies of confidential assets; publication still requires current approved, published source records.
- Transition is an explicit click, not automated crossfade. True crossfades or timed playlists require separate synchronization and authorization design.
- Editor intentionally does not generate media, create a campaign encounter, or change viewer permissions.
