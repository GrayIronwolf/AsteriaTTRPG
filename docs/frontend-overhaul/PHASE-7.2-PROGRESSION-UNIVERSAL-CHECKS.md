# Phase 7.2 — React/Vite Skills, Talents, Progression and Universal Check Requests

## Migration boundary
This phase replaces the old player and GM controls with new isolated React/Vite views. The original deployed dashboard is left untouched until the final Phase 10 cutover. The flag `VITE_ASTERIA_PROGRESSION_ENABLED=true` enables only the migrated preview. It is **off by default**.

## Canonical services and model
- Existing single Firebase Auth/Firestore/Functions instance and verified account profile.
- Server-confirmed v1 GM / v2 co-GM permissions, and source-verified linked player-character ownership. Client cached snapshots and pending local writes are never sufficient for access; role revocation closes listeners.
- Existing `campaigns/{id}/checkRequests`, `checkGroups`, `checkCommandReceipts` remain authoritative and server-managed by the same `asteriaUniversalCheck` callable, with idempotency, frozen modifiers and a separate GM-only group record.
- Existing `asteriaAction` callable remains authoritative for `spendCharacteristicAllocations`, `recordSkillSuccess`, `purchaseTalentRank` and `useCharacterTalent`. No independent client rank, TP, CP or spell-cost calculations are committed to Firestore.
- GM XP is an additive callable command `grantCharacterXP` using the existing `AsteriaProgression.grantXP` rules (not a second level-up engine). It validates GM membership, live session, canonical linked character and private source; writes campaign and owner record atomically through existing core revision and action-receipt paths.
- Existing 7-rank skill training and newer 8-rank Universal Check Request modifier semantics are **not automatically converted**. The UI displays recorded skill values and the check server freezes the approved rank, including explicit legacy conversion when needed.
- The source currently lacks an authoritative feat choice/purchase command and an approved feat catalogue. Show recorded feats and levels 10, 30, 50, 70, 90 as progression milestones without granting speculative feats or introducing unreviewed player rewards. Feat selection remains explicitly locked until the rules and server contract are established.
- Published, sanitized Compendium talent information is loaded from existing public Forge and entry shards; no GM-only Compendium data or legacy window globals are mounted. The existing server rejects purchases without valid authored ranks, prerequisites, TP and class ownership.

## GM and Player functionality
- GM: verified party, award XP with required reason; send skill/characteristic/social/saving/group/opposed/crafting check requests, configure DC/advantage, rank overrides and situational modifiers, inspect history, acknowledge, resend, cancel, reroll and override with audit reason.
- Player: view progression XP, level, CP, TP, recorded feat milestones; allocate CP through a server transaction; view skills and record training successes; browse class talents and purchase authored ranks; use eligible learned talents; see in-dashboard GM check popups and history, digital (server RNG), physical d20 input and manual success/failure reporting.
- Opposed checks do not allow self-reporting. Group outcomes are server-adjudicated. Player snapshot projects only the owner's check requests; group records and private other-participant dice remain inaccessible.

## Verification and cutover
- Pure model and mock-verified Firebase tests exercise role gates, source ownership, receipt IDs, projection privacy, talent rank authoring, XP and check action contracts.
- Two-account emulator browser test reuses the established Forge/campaign integration and exercises GM XP -> owner level-up, CP allocation, UCRS digital dice, reroll and physical d20.
- Dedicated GitHub Actions and existing website/Firebase/security regression checks must pass before merge; production hosting and feature activation remain deferred until all 10 phases are complete.
