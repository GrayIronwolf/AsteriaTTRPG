# Asteria TTRPG — Campaign Connection Upgrade, Phase 1.2
## Proposed Firestore data contracts (design only)

**Date:** 2026-11-08  
**Baseline:** main at `8959f4607faadc18964e016f7b7cd79b08018d07`  
**Status:** schema design prepared; **not deployed**. Phase 1.2 makes no changes to application code, Firebase Rules/Functions, indexes, live data, artwork, or gameplay.
**Source:** [Phase 1.1 audit PR #85](https://github.com/GrayIronwolf/AsteriaTTRPG/pull/85).

### Goals and invariants

1. A campaign UCN is a stable 12-digit identity/lookup handle, **never** a bearer credential.
2. The only source of campaign *access* in schema v2 is an active, server-controlled membership (plus verified campaign-owner identity). Local mirrors, role arrays and character links confer **no** access.
3. Join requests, invitations and character participation are separate from membership and from each other.
4. Campaign membership is not automatically granted through a UCN; GM approval is the default. Explicitly authorised invitation policies may allow auto-approval for player role only.
5. A character is always owned by `users/{ownerUid}/characters/{sourceCharacterId}`; the GM does not acquire the account-owned record by inviting, linking, deactivating, or removing someone.
6. Private recipient email, token digests, approval notes, join requests and audit data must never be stored on member-readable `campaigns/{campaignId}` documents or in full account copies.
7. Version-gated migration must not break existing participants, live sessions, saved sheets, XP, inventories, notes, character images, artwork, or account switching.
8. All privilege changes and invitation claims are server-validated and transactional. Browser logic and buttons are presentation only.

### Logical relationships

`campaigns/{campaignId}`
- one-to-one `campaignDirectory/{ucn}` (UCN lookup only, server controlled)
- one-to-many `campaigns/{campaignId}/members/{uid}` (canonical membership, one per account)
- one-to-many `campaigns/{campaignId}/joinRequests/{uid}` (latest user request and revision, GM review)
- one-to-many `campaigns/{campaignId}/invitations/{inviteId}` (restricted invitation and delivery metadata)
- one-to-many `campaigns/{campaignId}/characterLinks/{linkId}` (owned-sheet association / approval)
- one-to-many `campaigns/{campaignId}/characters/{campaignCharacterId}` (existing live gameplay records)
- one-to-many `campaigns/{campaignId}/auditEvents/{eventId}` (server-only immutable audit)
- one-to-one `users/{uid}/campaignRefs/{campaignId}` (per-account discovery projection; non-authoritative)
- existing `users/{uid}/campaigns/{campaignId}` is a legacy full campaign mirror and must be retired *after* client migration.

Do not create a public listing of private campaign names, account emails, join requests or invite tokens.

### A. Shared campaign header — `campaigns/{campaignId}`

Keep the current stable `campaignId`, `ownerUid`, `name`, artwork and gameplay fields. Add only after versioned readiness:

| Field | Type | Invariant |
|---|---|---|
| `membershipSchemaVersion` | integer (legacy absent/1; v2 = 2) | Single server-controlled cutover discriminator; legacy/2 checks **must not be ORed** |
| `ucn` | 12-digit string | Permanent lookup handle; never sufficient to authenticate access |
| `ownerUid` | Firebase UID | Owner's authority cannot be transferred by join request/invite |
| `joinPolicy` | map | `requestMode: "gm-approval"` by default, `joinRequestsOpen` boolean, `autoApproveInvites` boolean |
| `capacity` | map | `maxPlayerAccounts`, `maxActiveCharacters`, `maxCharactersPerPlayer`; counted and enforced by server transactions |
| `membershipRevision` | integer | Increment on authoritative membership changes so clients can invalidate stale views |

**Important:** `campaigns/{campaignId}` remains readable by members under existing rules, so only member-safe metadata belongs here. Do not add email addresses or secret invite tokens. Existing `inviteCode`, `uniqueCampaignCode`, `invites`, `playerUids`, `gmUids`, `roles`, `players`, `party` and `playerCharacterLinks` stay as *legacy compatibility data* during the transition, not v2 authority.

### B. Permanent UCN directory — `campaignDirectory/{ucn}`

Server-generated, collision-checked records: `{campaignId, ownerUid, status:"active"|"closed", createdAt, updatedAt}`.

- Create a unique 12-digit UCN in a transaction with CSPRNG (`crypto.randomInt` / equivalent) and retry on collision; do not rely on browser-local campaigns or `Math.random`.
- Public preview is an authenticated, rate-limited callable returning a strictly limited public-safe summary, not a direct Firestore document read. Respect campaign visibility.
- Preserve the existing UCN throughout migration. Existing `campaignInvites/{ucn}` is a **legacy** credential registry; do not continue accepting it as membership authority after v2 cutover.
- If a migrated UCN is missing, duplicated or inconsistent, stop that campaign's cutover and log for owner review, never silently reallocate a UCN.

### C. Membership — `campaigns/{campaignId}/members/{uid}`

This is the **canonical role and access record** for schema v2.

| Field | Type | Allowed / meaning |
|---|---|---|
| `uid`, `campaignId` | strings | Must match Firestore path and authenticated actor/verified target |
| `role` | enum | `owner`, `co-gm`, `player` |
| `status` | enum | `active`, `suspended`, `removed`, `banned`; `pending` is represented as a join request and is **not** a membership grant |
| `joinedAt`, `updatedAt` | server timestamps | Accepted date and latest state change |
| `invitedByUid`, `approvedByUid` | UID or null | Server-controlled provenance |
| `lastStatusReason` | short string or code | Restricted to GM and affected account, never campaign-wide |
| `revision` | nonnegative integer | Monotonic per-member changes; server controlled |
| `origin` | enum | `legacy-migration`, `join-request`, `invitation`, `owner-creation` |
| `capabilityOverrides` | validated map | Optional grants only for a permitted owner-defined subset, never ownership/role escalation |

**Authorization:** owner = `campaign.ownerUid===request.auth.uid`; other users require member doc for that UID with `status==="active"`. Inactive roles never confer access, even if legacy UID/role arrays or character links still mention them. A v2 member doc with `status==="removed"` or `"banned"` is a tombstone, not an access grant. Never allow a campaign owner to suspend/remove themselves by ordinary member actions. Only the owner may transfer ownership, using a separate audited flow (out of scope here).

**Co-GM:** legacy `roles[uid]==="gm"` or `gmUids` (other than owner) maps to `"co-gm"`. Co-GM authority is a scoped permission set controlled by the owner; it must not imply authority to assign new co-GMs, transfer ownership or change owner-scoped security policy. Only owner can issue a co-GM invitation.

**Session presence** (`campaigns/{id}/sessions/{sessionId}/presence/{uid}` and current live session state) is separate. `absent` or `offline` does not revoke membership.

### D. Join request — `campaigns/{campaignId}/joinRequests/{uid}`

One current record per account and campaign, with auditEvents retaining attempts/transitions:

`{ uid, campaignId, status:"pending"|"approved"|"declined"|"cancelled"|"expired", requestRevision, createdAt, updatedAt, respondedAt, respondedByUid, source:"ucn"|"invite-link"|"email-invite", invitationId:null|string, proposedSourceCharacterId:null|string, requestedRole:"player", reasonForGM:null|string }`.

- Only authenticated user may submit/cancel their own request via server callable. A UCN lookup alone is never a join.
- Repeated submissions are idempotent while pending; subsequent attempts after decline/cancellation follow server policy and increment `requestRevision`. Ban blocks new requests and invitation acceptance.
- Only campaign owner / specifically authorised co-GM can approve/decline. Store reviewer identity and timestamp in same transaction that creates or activates membership.
- No direct member list or campaign read is granted while request is pending. Caller may get only **their own** request; reviewers may list pending records.
- A requested co-GM role cannot come from an unverified UCN form or client-supplied field.
- Optional proposed character is a private owner-owned *reference*, not an imported gameplay record; link approval is a separate step in Phase 5.

### E. Invitation — `campaigns/{campaignId}/invitations/{inviteId}`

Private server-managed records, readable only to owner/authorised invitation-management Co-GM. **Never** include the collection contents in the member-readable campaign header or account campaign snapshots.

`{ inviteId, campaignId, type:"email"|"share-link", roleOffered:"player"|"co-gm", status:"draft"|"active"|"revoked"|"expired"|"exhausted", tokenDigest, recipientEmailNormalized:null|string, recipientUid:null|string, createdByUid, createdAt, expiresAt, maxUses, usedCount, requiresGMApproval, lastSentAt, deliveryStatus:null|"queued"|"sent"|"failed"|"bounced" }`.

- Create a fresh, high-entropy random token server-side (e.g. 32 bytes); give raw token **only once** in the generated URL. Store only a keyed digest (`HMAC-SHA256` with backend secret), never raw token. URL identifies campaign/invite ID + raw token.
- Individual email invites require recipient-account identity matching a verified email; any email delivery provider credentials and retry metadata remain server-only. Normalize email for matching but do not expose it to ordinary members.
- `expiresAt` and `status` checked server-side **on every redemption**; revocation takes effect independently of saving campaign details.
- Use `claims/{uid}` or an equivalent per-invite receipt for once-per-account deduplication. Check `maxUses` and increment `usedCount` atomically at actual approval/acceptance; keep pending reservations bounded as needed. Repeated retries must not consume multiple uses.
- Whether valid invitations auto-approve **players** is a GM-configured policy; co-GM activation always requires owner authorisation. Existing members are not removed merely because an invite expires.
- Do not create an email sending capability in Phase 1.2; email delivery is Phase 7.

### F. Character participation — `campaigns/{campaignId}/characterLinks/{linkId}`

`{ linkId, campaignId, ownerUid, sourceCharacterId, campaignCharacterId, status:"pending"|"approved"|"inactive"|"unlinked", requestedAt, approvedByUid, approvedAt, updatedAt, role:"player-character" }`.

- Private source: `users/{ownerUid}/characters/{sourceCharacterId}` is never transferred or deleted when changing participation.
- Shared gameplay: `campaigns/{campaignId}/characters/{campaignCharacterId}` retains all existing HP/SP/MP, XP, inventory, rewards, and campaign-specific progression. Never regenerate existing IDs or overwrite sheets when backfilling links.
- New `campaignCharacterId` is a unique, campaign-scoped ID (not a naked legacy Forge ID). Prevent duplicate association with a server-maintained unique key `characterLinkKeys/{sha256(ownerUid+"\\0"+sourceCharacterId)}` or equivalent transactional reservation; allow different owners to use the same *source* character ID.
- A request to link must validate ownerUid, source sheet, active membership, allowed character limit and GM link/approval preference **inside one transaction**; pending links do not enter active party or combat until approved.
- Owner-verified recovery of legacy links must be idempotent and never elevate membership or change ownership.

### G. Private account discovery — `users/{uid}/campaignRefs/{campaignId}`

Minimal server-derived projection: `{campaignId, role, status, displayNameSnapshot, updatedAt}`. Only account owner can read; clients cannot write authoritative role/status. Used for account discovery; membership doc remains authoritative and is checked on opening campaign data. A removed/banned account may see a limited historical status but not campaign content.

Retain `users/{uid}/campaigns/{campaignId}` only as a temporary legacy snapshot until *all* clients switch to `campaignRefs`. Full campaign copies are unsuitable for v2 membership or privacy. Do not create a new account-facing copy of GM-only fields.

### H. Server audit — `campaigns/{campaignId}/auditEvents/{eventId}`

Append-only, server-generated: `{eventId, actorUid, subjectUid, category, action, previousStatus, nextStatus, createdAt, requestId, metadata}`. Restrict reads to owner/authorised Co-GM, omit email secrets/tokens, trim metadata, and define retention. Every membership approval, denial, suspension, role change, ban, invitation revocation and character link status transition needs an event. Audit/notification is **not** itself a permission authority.

## Access and visibility matrix (target v2)

| Principal | Campaign/private gameplay | Own membership and join request | All members/requests | Invites including email data | Manage membership | Read GM private systems |
| --- | --- | --- | --- | --- | --- | --- |
| Owner | Full | Yes | Yes | Yes | Yes (except remove self) | Yes |
| Active Co-GM | Scoped | Yes | Configurable | Configurable | Owner-authorised only | Yes |
| Active player | Allowed campaign/party scope | Yes | Limited party-safe projection only | **No** | No | No |
| Pending requester | **No** | Own pending request only | No | No | No | No |
| Suspended/removed/banned | **No** | Minimal own status | No | No | No | No |
| Unauthenticated | **No** | No | No | No | No | No |

The precise character-field visibility policy is a separate review, but member list reads must not disclose email addresses or full membership reasons to other players.

## Security Rules and callable migration contract

For `membershipSchemaVersion != 2`, legacy membership checks stay in force while the campaign remains on v1. **For v2**, Firestore Rules, Storage Rules, server `isCampaignMember`/`isCampaignGM` and all React/legacy services must agree on the new authoritative membership doc and status.

**Never implement:** `isLegacyMember(...) || isV2ActiveMember(...)` for v2 campaigns. This permits revoked legacy records to regrant access.

- Pending requests are created via callable with Auth and optional App Check / throttling; no direct client grants.
- Membership/role changes, capacity checks, invitation consumption and character link approval are transactionally server-controlled. Client Firestore writes cannot fabricate member docs.
- Rules for direct shared-character imports, partyChat, sessions/presence, events, GM workspace, campaign artwork, gallery access and campaign reads must use the same v2 active-membership guard.
- After status change/revocation: unsubscribe/mask stale client views, invalidate local cached snapshots and reject new server actions; previously downloaded data and externally shared Storage download URLs cannot be retroactively recalled. Review token URL exposure separately.
- Separate member-safe campaign description/preview from restricted invitation records. Preview callable should use uniform rejection behaviour and rate limits to reduce enumeration.

## Capacity and indexes (design proposals, not deployed)

- Standardize `partySize` (legacy creation 1–12), `playerLimit` (current GM 1–50), `settings.partySize` and `maxPlayers` into explicit `capacity.maxPlayerAccounts` and `capacity.maxActiveCharacters`. Count distinct **active player UIDs**, excluding owner and Co-GMs, and approved active characters separately; do not conflate.
- Enforce limits under concurrent requests with a server transaction and count/lease maintained on the campaign header or dedicated server-only aggregate; never rely on UI counters alone.
- Likely composite indexes: campaign `joinRequests(status,updatedAt desc)`; invitations `(status,createdAt desc)`; `characterLinks(ownerUid,status)` and `(campaignCharacterId,status)` as required by actual queries. Single-field lookups use default indexes. **Confirm actual queries and Firestore index requirements in later implementation before editing firestore.indexes.json.**
- Avoid large embedded UID maps and array fan-out in campaign root. Use subcollection pagination, bounded queries and appropriate field-index exemptions for token digests/private long strings.

## Version / compatibility precedence

1. A campaign is v1 until server sets `membershipSchemaVersion=2` after full readiness checks; absent version means v1.
2. **V1 permissions:** existing owner / gmUids / playerUids / roles checks only. Do not begin honouring a partially populated v2 member collection until campaign cutover.
3. **V2 permissions:** ownerUid or active canonical member doc. If member doc absent or status not active, deny access, regardless of local/private snapshots or legacy role arrays.
4. V2 display: canonical member docs and characterLinks project into UI. Old fields remain only compatibility shadows until all relevant consumers are migrated, and must be replaced from server v2 state, never *union-merged* from stale local data.
5. Existing `users/{uid}/campaigns` mirrors are not authoritative. New `campaignRefs` cannot confer access and do not override a v2 denial.
6. Legacy invitations `campaignInvites/{ucn}` must stop granting membership before any campaign is v2. Preserve UCN as lookup only. Never overwrite revocation status during unrelated campaign saves.
7. Cutover is per campaign and reversible only **without regranting previously revoked users**. Roll back UI/feature surfaces while retaining v2 restrictive security unless the owner-approved access reconciliation explicitly validates all accounts.

## Phase assignment (no implementation here)

- **1.3:** feature-flag/test scaffolding, test fixtures, emulator policies for v1 baseline + proposed v2.
- **2:** server-generated UCN registry, canonical membership docs, versioned guards, safe campaign discovery.
- **3:** join request and approval transactions/UI, capacity and idempotency.
- **4:** GM roster and role/status control, activity trail.
- **5:** character link schema and approval; collision-safe identifiers and repair.
- **6:** secure invitation lifecycle and share/QR URLs.
- **7:** email provider, recipient verification, in-app notifications and delivery tracking.
- **8:** migration verification, rollout, end-to-end accessibility/account-switch/revocation testing.

**Definition of done for 1.2:** canonical design, security boundaries, legacy field mapping, migration/rollback plan and next-phase test contract documented on an isolated branch. No production data writes.
