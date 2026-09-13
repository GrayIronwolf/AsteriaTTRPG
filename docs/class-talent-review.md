# Class talent repair

The React dashboard and authenticated Firebase callable now share class and talent identity, current rank, source rank details, resource rules and effect tracking. Current compendium pages take priority over the obsolete static class trees. The compendium indexes are retained as authored.

## Repaired behavior

- Forge class objects, nested class information, slug lists and combined multiclass labels resolve their current trees.
- Legacy talent maps, arrays and starting-talent lists merge without dropping purchased ranks. An unqualified duplicate name belongs to the first matching class; Cleric and Spellblade Mana Well remain distinct purchases.
- The dashboard opens talents with one click. The tree connects a central tier node to talent branches and five inspectable rank bubbles. Locked tiers can be previewed; ranks have complete descriptions and effects.
- Purchases run in the existing authenticated transaction and require character ownership, an active GM session, the correct class, sufficient TP, unlocked tier, authored rank and prerequisites. The UI sends an expected rank; transaction receipts make retries idempotent. Both the campaign sheet and the owner's source character are updated.
- TP pricing is shared: `3 × (tier + next rank − 1)`. Existing level gates remain 1, 10, 20, 30 and 40. Old frontmatter often lists only an initial or obsolete flat TP cost.
- Active talent payments use current rank payment clauses and reviewed exceptions. HP sacrifices leave at least 1 HP. Blood Points are generated when specified, rather than deducted as mana. Blood Tithe, Mystic Recovery, Hunting Shots and Arcane Pursuit expose the choices needed to compute their costs. Spell Weaving also pays the chosen known spell's cost.
- Mana Well uses the current authored multipliers ×3, ×6, ×9, ×12 and ×15 against base maximum MP. New capacity is granted once on learning/upgrading. Recalculation does not refill or compound it; CP and Forge edits preserve the base and spent mana. Duplicate Mana Well effects use the strongest multiplier.
- Blood Control increases the BP limit; Mystic Recovery increases natural rest recovery; Fortified Mind records scoped saving-throw bonuses. Blood Shield and Sacred Aegis contribute to the existing AC calculation. Sacred Aegis can protect a linked ally and updates that player's saved sheet atomically.
- Temporary effects have source, rank, duration, encounter and dismissal state. Rest resets only the appropriate use counters. Current encounter rounds govern cooldowns and expiry; outside combat, the six-second round equivalent is used. New encounters receive a stable combat ID.

## Authored content and automation boundaries

Many placeholder classes/ranks still say “Information coming soon.” They remain inspectable and cannot consume TP. Variable or GM-defined costs without enough source data block automatic use and explain why. Narrative benefits, attack outcomes, range, dice, Action Points, conditional triggers, auras, patron bonuses and complex talent combinations still need the GM's resolution; their full rank rules remain visible. The engine does not guess missing rules or treat every conditional bonus as an unconditional sheet modifier.

The source currently says **455 MP** for Aura of Courage Rank 5. That value is retained; changing it requires a rules/content decision. Some tier/rank manuscripts have incomplete Effects sections. These should be completed in the source content rather than guessed in the UI.

## Validation

- `npm test`: existing regression suites and focused class-talent tests.
- `npm run test:firebase`: real Firestore/Auth/Storage emulator tests, including concurrent/retried purchases, ownership, paused sessions, insufficient resources, legacy classes, both character copies, targeted AC and mismatched/deleted private targets.
- `npm run build`: committed production assets regenerated.
- `npm run dev`, then `/scripts/fixtures/talent-preview.html`: disposable local UI fixture with class selection, purchase/use controls, pause control and a 390px iframe for mobile review. It does not connect to a campaign.

React server rendering was checked. The cloud browser could not access the local preview (`ERR_BLOCKED_BY_CLIENT`); interactive visual browser verification was not completed in that environment.

## Release

Merge the reviewed PR and publish the committed frontend assets through the repository's normal website release. Then run **Deploy Firebase backend (manual)** on `main` for project `asteria-ttrpg`. The new use/end/refresh actions require the updated callable, so publishing only the frontend is insufficient. This PR does not claim that production Firebase has already been deployed.
