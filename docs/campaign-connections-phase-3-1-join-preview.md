# Campaign Connection Upgrade — Phase 3.1: Join Campaign Discovery

**Scope:** UCN lookup, safe preview, authenticated account verification. This step does **not** create join requests, approve players, or deploy email invitations.

## Changes

1. The existing Campaign Forge Join Campaign card now begins with **Find Campaign**. It accepts exactly 12 digits (with optional visual spaces/hyphens), preserves leading zeros, and clears stale confirmation when the input is edited.
2. Account checks compare the signed-in Firebase Auth UID with the account session UID. Test Login and unsigned sessions cannot discover other accounts' campaigns.
3. The authenticated server UCN lookup now returns only the campaign ID, display name, UCN, and a minimal `joinMode`: `legacy`, `request`, or `unavailable`. It does not expose owner email, roster, settings, private records or invitation tokens. All existing rate limits and server-side ownership verification remain intact.
4. The preview presents the campaign's name/UCN, the verified signed-in account, and whether the joining pathway is legacy-compatible or requires GM approval.
5. **Legacy v1 joining** remains available behind a separate **Confirm & Join Campaign** button. The confirmation rechecks the code, preview ID, Firebase UID, and account session. New character selection is shown only after successful server-verified joining.
6. **V2 campaigns** are shown as GM-approval-required, but no direct join button is offered. Their join-request pathway is intentionally deferred to **Phase 3.2**, with approval in **Phase 3.3**.
7. A response without an explicit `joinMode` is **unavailable by default**. When a deployed older backend is missing the newer callable, the existing server preview may be used only for backend-not-found errors; legacy mode can be inferred solely for a matching locally authenticated, already-known v1 campaign. No fallback is permitted for a rate limit, permission failure, or forged response.
8. Existing campaign membership, character sheets, XP, inventory, images, approved frames/buttons and dashboard layout are unchanged.

## Test / acceptance matrix

- Strict UCN validation and leading zeros.
- Server preview matching exact campaign ID and UCN; no attacker-supplied HTML inserted without escaping.
- Expired/closed directory entries, malformed campaign ID, unknown schema version, and not-found UCN.
- Account changed during lookup or between lookup and confirmation: no membership write.
- Changing the UCN after preview: requires lookup again.
- Legacy v1 campaign: explicit confirm before calling the old joining endpoint.
- V2 campaign: informational preview only; no direct join, no automatic membership.
- Mobile layout, keyboard status message, preview visibility, and low-width confirmation.
- Existing v1 UCN links and Forge paths still navigate to the Join Campaign card.

## Production rollout constraint

The website frontend can be merged independently, but the new `joinMode` field requires deploying the corresponding Cloud Functions using the separately managed production backend workflow. Until the backend is deployed, an old preview response cannot be used to join an unknown campaign. This safety-first behavior can temporarily limit legacy joining for first-time accounts. Deploy and verify the backend before declaring the new Join Campaign experience available to all players.

This phase never flips `membershipSchemaVersion=2` on any campaign or activates production migration flags.

## Next phase

Phase 3.2 adds server-side join requests, duplicate protection, pending status, and optional character preference. This phase is not started automatically.
