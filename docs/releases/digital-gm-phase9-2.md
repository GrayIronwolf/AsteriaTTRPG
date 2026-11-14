# Digital GM Phase 9.2 — Soundboard & Ambient Audio

## Scope
- A GM-only soundboard supports private audio uploads (MP3, Ogg, WAV and WebM), previews, publication, unpublication and archival.
- The GM can launch an ambient or music track, pause/resume/stop, and trigger one-shot effects. Live cues sync through a single campaign document.
- Players can open Character Dashboard → Campaign Audio and must explicitly enable sound locally. Sound is muted by default; every player can mute and adjust their own device volume.
- Audio files are in authenticated Firebase Storage and are never exposed via public token URLs. GM-only drafts are not player-readable. Players receive a reduced public metadata projection and the live transport cue.
- A GM is required to authorize every write server-side. No microphone capture, user-to-user communication, automatic autoplay or recording.
- This phase is separate from Phase 9.3 recording/archives and the later Obsidian integration.

## Operator test
1. Open GM Dashboard → Soundboard & Ambience. Upload one file of each accepted type (20 MB maximum).
2. Preview private tracks as GM; confirm players cannot see or download them.
3. Publish a music or ambient track; start/pause/resume/stop. On another authenticated player device, navigate to Campaign Audio and press Enable Audio.
4. Publish and trigger an effect; confirm local volume/mute controls and that one-shot effects are not looped.
5. Withdraw a currently playing track: verify the player's access and playback stop. Archive a sound and check secure Storage cleanup.
6. Check cross-campaign isolation, co-GM permissions and invalid/oversize upload failures. Test live session state through the real website.
7. Review the workflow results for unit, Firestore/Storage emulator, lint, dashboard regressions and production build.

## Deployment
Merge Phase 9.2 after CI and generated frontend bundle publication. **Defer all production Firebase deployment until Phase 9.3 completes.** Then run the existing manual Firebase deploy workflow on `main` with operation `deploy` and confirmation `DEPLOY-ASTERIA-PRODUCTION`. Hosting has a separate publishing path. No new third-party services, paid audio provider or migration is needed.

## Limitations
- This is per-device, best-effort browser audio. Players must enable it in their browser and their device must permit playback. It is not voice chat, a global always-on service, DRM, a sample-accurate synchronised stream or a streaming audio relay.
- Only upload audio you have permission to distribute. Browser MIME/header checks and Storage rules validate declared media types but do not replace server-side antivirus/transcoding.
