# Digital GM Phase 9.1 — Native Session Notes and PDF Library

This phase adds structured, campaign-scoped GM notes and a private PDF library with explicit publication of handouts to members. It is independent of the later Obsidian vault integration.

## Security
- New `sessionNotes` and `sessionPdfs` Firestore collections are GM-readable, callable-write-only. `sessionPdfsShared` contains a separate, restricted projection.
- PDF objects use private Firebase Storage access, authenticated blob reads, 20 MB limits and create-only uploads. No public download tokens or player write permissions.
- Membership is checked by the established v1/v2 campaign rules; the GM command reuses canonical GM authorization and idempotent callable receipts.
- Optimistic revision checks prevent stale note edits, publication or deletion. Published PDFs may be unpublished immediately; this removes the shared projection and revokes player blob permissions.
- Uploads are staged first, uploaded to a fixed per-campaign path and finalized. Interrupted uploads remain GM-private until explicitly repaired or archived.
- Legacy `GMWorkspace.notes.privateNotes` and `sessionLogs` remain unchanged and accessible. No destructive migration.
- The browser checks file extension, declared MIME type, size and PDF header; these are not substitutes for malware scanning. Do not upload untrusted PDFs.

## GM test checklist
1. Open **GM Dashboard → GM Notes** and confirm old private notes/session logs still display.
2. Create a structured note, revise its contents, refresh, and confirm it persists. Test filtering and deleting.
3. Upload a PDF no larger than 20 MB. Open the PDF preview with an authenticated GM account.
4. Confirm the PDF is private by default. Publish it and verify it appears in **Character Dashboard → Campaign Library** for an active player.
5. Unpublish the PDF and verify the player's library entry and blob access disappear; inactive players and outsiders must not see documents.
6. Archive a PDF and confirm it disappears from the active GM list. Check errors for invalid formats, oversize files, and stale revisions.
7. With a co-GM, confirm normal note/document operations work. Do not grant players editing rights.

## Deployment
Merge after successful tests and build. Run the existing **Deploy Firebase backend (manual)** workflow on `main` using operation `deploy` and confirmation `DEPLOY-ASTERIA-PRODUCTION` to deploy Functions, Firestore and Storage rules. The website frontend is delivered from the verified, committed `react-dist` bundle; follow the website publishing workflow where required. No API keys, SMTP services or migration are required. Use the rollback guidance in the existing deployment workflow if the live check fails.

## Scope exclusions
Phase 9.2 adds Soundboard/Ambient Audio; Phase 9.3 addresses Session Recording/Archives. Obsidian bidirectional synchronization is a separate future feature.
