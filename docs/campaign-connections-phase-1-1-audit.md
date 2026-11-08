# Asteria TTRPG - Campaign Connection Upgrade: Phase 1.1 Audit

**Audit date:** 2026-11-08 (Australia/Perth)  
**Repository:** GrayIronwolf/AsteriaTTRPG  
**Inspected baseline:** [8959f4607faadc18964e016f7b7cd79b08018d07](https://github.com/GrayIronwolf/AsteriaTTRPG/commit/8959f4607faadc18964e016f7b7cd79b08018d07) on main  
**Scope:** audit and design inventory only. **No application changes, Firebase deployments, account migrations, or gameplay changes are authorised in 1.1.**

## Executive summary

The current system supports campaign creation, a 12-digit Unique Campaign Number (UCN), signed-in joining through an authenticated Cloud Function, character-owner linking, Firebase-backed campaign synchronisation, and basic GM membership display. It does **not** yet provide GM-approved joins, dedicated revocable invitations, validated recipient emails, enforced suspended/banned states, or full GM member-management actions.

The principal design flaw is that the permanent UCN is also a reusable access credential: a signed-in account presenting an active UCN is immediately added to the campaign. This is intentional in current tests, not a proven incident.

An additional privacy concern is that email-ready invitation records are embedded in the campaign document. Members can read the complete campaign document under current Firestore rules; hiding invite controls from the player UI does not hide the email fields from a client with access to the document.

## Current architecture and flow

| Area | Current path and behaviour | Primary evidence |
| --- | --- | --- |
| Campaign creation | Campaign Forge builds the campaign, creates an owner/GM role, default invitation settings, UCN, and party size. | [Campaign Forge](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L928-L1015) |
| UCN generation | Browser-generated 12 digits via Math.random; uniqueness checked only against campaigns currently held in browser state. | [UCN helpers](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L217-L256) |
| Invite URL | The URL hash contains the permanent UCN. | [Invite URL](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L241-L255) |
| UCN registry | Owner saves campaign and writes campaignInvites/{ucn}, forcing active status on that record. | [Save campaign](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/firebase-auth.js#L1830-L1860) |
| Join UI | Signed-in player enters UCN; UI calls joinCampaignByUCN, then offers existing-character selection or new-character Forge. | [Join UI](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L769-L852) |
| Server invite access | Authenticated asteriaInvite callable checks code and campaign linkage, then immediately writes active membership for join=true. No GM approval/limit/expiry/recipient requirement. | [Callable](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/functions/index.mjs#L17-L25), [transaction](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/functions/invitations.mjs#L1-L24) |
| Email-ready invites | GM form records recipient email and link inside campaign.invites, but does not send mail. | [GM form](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L633-L644), [record](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L891-L915) |
| Character linking | Member can link owned character; transaction updates campaign summaries, party, links, shared character and private mirror. | [Linking transaction](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/firebase-auth.js#L331-L402) |
| Link recovery | Existing owner may repair inconsistent indexes after verifying campaign and saved sheet; no ownership or progression transfer. | [Recovery helper](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/functions/characterLinkRecovery.mjs#L1-L52) |
| GM management | React Campaign Manager shows player list, status, UCN, player limit and artwork, but no approve/suspend/remove/member-role controls. | [GM manager](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/src/dashboards/GMWorkspacePanels.jsx#L166-L186) |
| Membership security | Firestore and Storage use owner UID, gmUids, playerUids and/or roles, not a membership status; read rules cover whole campaign document. | [Firestore](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/firestore.rules#L26-L40), [Storage](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/storage.rules#L4-L20), [Campaign rules](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/firestore.rules#L157-L191) |
| Account discovery | Membership queries and private account mirrors feed campaign state; local and cloud fields are merged. | [Subscriptions](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/firebase-auth.js#L1919-L1985), [Merge](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/firebase-auth.js#L110-L140), [Sync](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/data-sync.js#L114-L132) |

### Existing Firestore layout (observed)

- campaigns/{campaignId} holds ownerUid, gmUids, playerUids, roles, players, party, characters, playerCharacterLinks, UCN and in-document invitation records, among other campaign fields.
- campaigns/{campaignId}/characters/{characterId} stores the shared campaign character.
- users/{uid}/characters/{sourceCharacterId} stores an account-owned character record.
- users/{uid}/campaigns/{campaignId} stores a private mirrored campaign record; the join callable currently copies the entire campaign object.
- campaignInvites/{ucn} maps the UCN to its campaign, owner and status.
- Campaign live sessions, party chat, GM systems and Storage depend on membership checks.

These collections are **current-state inventory**, not a proposal to migrate them in 1.1.

## Risk findings and priority

| ID | Priority | Finding and practical consequence | Evidence | Roadmap home |
| --- | --- | --- | --- | --- |
| CC-01 | **Critical** | A valid active UCN gives an authenticated account immediate player membership; there is no pending approval or GM decision. | [Invite join](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/functions/invitations.mjs#L12-L23); [existing test](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/scripts/firebase-integration.test.mjs#L130-L136) | 2.1, 3.1-3.3 |
| CC-02 | **High** | Permanent UCN and invitation link are the same reusable credential; links can be shared and there is no recipient binding, expiry, use limit or rate-limit check in the inspected callable. | [UCN URL](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L241-L255); [server](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/functions/invitations.mjs#L1-L24) | 2.1, 6.1-6.3 |
| CC-03 | **High** | Setting players[uid].status to suspended, removed or banned would not revoke Firestore/Storage permissions while UID remains in role/UID indexes. | [Membership checks](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/firestore.rules#L30-L40); [Storage](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/storage.rules#L4-L11); [server helper](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/functions/characterPermissions.mjs#L1-L2) | 2.2-2.3, 4.2 |
| CC-04 | **High - privacy** | Recipient email addresses and invite records are saved in the shared campaign document; any authorised member can read that document, regardless of GM-only UI controls. The join function also writes a full campaign copy to the joiner's private mirror. | [Invites saved](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L891-L915); [campaign read](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/firestore.rules#L165-L166); [mirror](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/functions/invitations.mjs#L19-L23) | 1.2, 6.1, 7.2 |
| CC-05 | **High** | Campaign saves rewrite campaignInvites/{ucn} with status active, undermining future revocation if only the invitation document status is changed. | [Save campaign](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/firebase-auth.js#L1830-L1857) | 1.2, 6.2 |
| CC-06 | **High** | Membership and character links are spread across overlapping fields; local-cloud merge unions old players/party/character links. Removed entries may remain visible or reappear from stale local data even where server permissions block access. | [Merge](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/firebase-auth.js#L111-L140); [Cloud merge](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/data-sync.js#L114-L132) | 1.2, 2.3, 8.2 |
| CC-07 | **Medium** | Link transaction checks membership and ownership, but not settings.allowPlayerLinkCharacter or separate character approval. | [Campaign defaults](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L973-L979); [link transaction](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/firebase-auth.js#L331-L402) | 5.1-5.2 |
| CC-08 | **Medium** | No capacity enforcement in joining transaction despite partySize/playerLimit being configurable; creation and manager expose different size ranges. | [Creation](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L938-L949); [GM manager](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/src/dashboards/GMWorkspacePanels.jsx#L166-L185); [join](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/functions/invitations.mjs#L12-L23) | 1.2, 3.3 |
| CC-09 | **Medium** | Shared character documents use the supplied characterId as a flat key; two different owners using the same ID cannot both link because owner mismatch is correctly rejected. This is safe but may block legitimate participation. | [Character ref and owner guard](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/firebase-auth.js#L335-L353) | 5.1, 5.3 |
| CC-10 | **Medium** | Email invitation form is a record generator; there is no actual outbound email or recipient-verified acceptance in the inspected flow. Dashboard invitations/notifications are placeholders. | [Email-ready record](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L891-L915); [Placeholder](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L450-L458) | 7.1-7.3 |
| CC-11 | **Medium** | No player management buttons, GM role-grant workflow, join-request inbox, or dedicated membership activity log in the inspected React Campaign Manager. | [GM manager](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/src/dashboards/GMWorkspacePanels.jsx#L166-L186) | 3.3, 4.1-4.3 |
| CC-12 | **Medium** | UCN uses Math.random and only browser-local collision detection; durable code allocation and uniqueness need server ownership, transaction and stronger randomness. | [Code generator](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L217-L239) | 2.1, 6.1 |
| CC-13 | **Low** | GM counter can double-count campaign owner: creation includes owner in gmUids, and UI shows 1 + gmUids.length. | [Creation](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/js/clean-compendium.js#L950-L962); [Counter](https://github.com/GrayIronwolf/AsteriaTTRPG/blob/8959f4607faadc18964e016f7b7cd79b08018d07/src/dashboards/GMWorkspacePanels.jsx#L184-L185) | 4.1 |

### Safeguards to retain

- Owner-controlled characters and verification of ownerUid before linking; no ownership transfer simply because GM can view a character.
- Existing Firestore GM-only restrictions for private notes and sensitive systems.
- Initial sheet linking and recovery checks that do not replace existing XP, inventory, progression or character identity.
- Scoped authenticated Cloud Functions and request receipts already used for other gameplay commands.
- Firestore emulator integration tests and active React/legacy compatibility support.
- Approved website artwork, dashboard layouts, gameplay and mobile interface.

## Current test coverage and gaps

**Present:** scripts/firebase-integration.test.mjs checks that invite preview returns only id/name/ucn, valid join grants membership, and an invite whose owner does not match the campaign cannot join. It also covers selected cross-account character and Storage permissions. The test explicitly assumes auto-join is intended behaviour today. Workflow .github/workflows/firebase-checks.yml runs lint, tests, Firestore/Auth/Storage emulators, content validation and production build on pull requests.

**Add in later phases, not Phase 1.1:**
1. UCN preview never grants membership; request only creates pending membership.
2. Only authorised GM/owner can approve/decline a join; duplicate and concurrent requests remain idempotent.
3. Suspended, removed and banned accounts lose read/write access in Firestore, Storage, server commands, subscriptions, and direct navigation.
4. Player cannot read recipient emails, hidden join requests or private invitation records.
5. Link expiry, revocation, use count, recipient-email binding and resend idempotency.
6. GM-selected player/character limits enforced atomically under simultaneous requests.
7. Two distinct accounts with identical source character IDs can coexist without changing their source ownership.
8. Existing membership migration and player reinstatement preserve owned sheet progress and inventory.
9. Cross-device updates, logout/login, account switching, offline/reconnect and stale local mirror cleanup.
10. Mobile/tablet/desktop joined, pending, suspended and error-state accessibility.

### Verification limits

- Findings are supported by source code at the pinned baseline and existing tests, not by inspecting production user documents or deployed Firebase Console configuration.
- Current source is not evidence that Firestore Functions and rules on the live website exactly match the repository; production deployment must be checked separately before migrations.
- Local repository tests require a checkout and dependencies. CI checks on the documentation-only PR can validate this change without changing live website functionality.
- A successful existing CI result confirms the checked source revision, **not** that the proposed feature set exists or passes acceptance testing.

## Phase 1.1 handoff

1. Preserve the 12-digit UCN as a permanent campaign identifier, not an access secret.
2. In 1.2, design authoritative membership, private invitation, join request and character participation records with reversible migration; choose canonical precedence over old UID/role arrays.
3. In 1.3, implement new test fixtures/feature flag scaffolding and verify legacy account/character behaviour before any joining changes are enabled.
4. Keep the remaining phases isolated: 2 membership/UCN, 3 joins/approval, 4 GM control, 5 characters, 6 invitation links, 7 email/in-app notifications, 8 rollout.
5. During all implementation phases, make protected changes via server-verified transactions; keep private emails, invite tokens and approval data out of member-readable campaign documents.

**Phase 1.1 definition of done:** source map complete; risks prioritised; safeguards and tests identified; report versioned on its own branch and available for review. No runtime code or production configuration changes.
