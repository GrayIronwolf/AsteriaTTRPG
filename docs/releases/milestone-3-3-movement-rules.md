# Milestone 3.3 movement rules audit

| Rule | Existing source | Map implementation or gap |
| --- | --- | --- |
| Move and Dash AP | `DEFAULT_COMBAT_ACTIONS` in `src/state/combatRules.mjs` sets Move to 1 AP and Dash to 2 AP. | Direct walking spends the existing Move cost. A resolved Dash records a GM-approved distance and uses the AP already charged by combat. |
| Walking allowance | The character system applies active movement modifiers to a recorded base movement value. The Pixie records include separate walking and flying speeds. | Use the recorded walking speed and evaluated character effects. Some character and race records have an empty movement field. Their allowance requires the GM to consult the source and approve a distance. |
| Dash allowance | The combat pipeline stores the GM-approved distance. | A universal Dash distance or multiplier was absent from the repository sources reviewed. Keep the approval field as the authority for the actual distance. |
| Swim, Fly and Climb | The combat pipeline has separate basic actions and checks for capability and feasibility. Climb and climbing Dash also carry their recorded SP cost. | An approved flight uses its own horizontal range and legal destination footprint. Water, elevation, climbing surfaces and mode-specific traversability need terrain data. |
| Jump | The Meaningful Jump action spends the existing SP cost and requires previously paid movement. | After successful resolution, an approved landing spends part of the already paid movement. The GM confirms the source's range, height and restrictions. |
| Teleport and forced movement | The Swordsmanship opportunity attack rules exempt teleportation and forced movement. Other restrictions are source-specific, such as Arcane Dominion's Wisdom saving throw. | A successful spell or talent can grant one teleport in its approved range. The GM records forced movement through the audited reposition command after resolving the source. |
| Movement talents and spells | The effect engine supports structured modifiers with the `movement` target. Some talents describe conditional movement in prose, such as Blood Rush's interaction with Marked Prey. | Structured modifiers affect basic range. GM-approved ground movement, jumps and teleportation become available after successful source resolution. Conditional effects in prose need GM adjudication. |
| Opportunity attacks | The existing action queue uses a GM-confirmed leaving-reach trigger and respects Disengage. | Confirmed moves that could face an eligible visible opponent go to the existing GM reaction review. The GM adjudicates reach using the route on the combat map. Teleport and Disengage skip this review. The one-per-round out-of-turn move or attack remains separate from reactions. |

Existing square maps retain their stored scale. The approved 3 m default, hex geometry and terrain-aware route checks belong to Milestone 3.4.

## Source-resolved forced movement (follow-up)

The GM may choose `forced` movement on a linked combat map after resolving the source's attack, saving throw or effect in the existing combat pipeline. The authoritative transaction requires a source ID, source type, travel mode, positive range (at most 1000 m), explicit resolution confirmation, and a 5–160-character reason. The destination must fit the token's footprint, remain within the map, be unoccupied, and fall within the approved distance. Ground displacement uses traversable routes and cannot cut across blocked square corners. Flight and teleportation use the source-approved direct range and landing footprint. Forced movement consumes no target AP or voluntary movement allowance, does not require the target's turn, and records the source, distance, positions and GM reason in the combat audit log. These checks enforce the GM-confirmed source parameters; they are not an automatic parser of every spell or talent's prose. The existing `reposition` correction remains separate and still requires an audit reason.

## Map-only delegation (follow-up)

For an active linked encounter, the GM may grant or revoke map-only movement control of an individual combatant token to a verified campaign player. The recipient is selected from linked campaign characters in the GM map editor. Only the server may alter `movementDelegateUid` in the encounter's participant state. This permission never authorises declaring combat actions, spending AP through combat controls, editing tokens, changing map settings, or GM operations. It is checked again for each move and revocation applies immediately. The shared combat snapshot reveals a boolean delegated marker and a visible token ID where relevant, but does not publish the recipient account UID. A recipient can select the delegated token from the player battle map view. For NPCs and other actors without recorded walking speed, the GM must first resolve and approve movement in the existing combat system.

## Verification and release hold

The follow-up introduces regression cases for permission denial, delegated movement and revocation, forced movement without AP spend, approved-range limits, and sanitised player projection. CI must pass on the final head before marking PR #394 ready, and the integration and publication safeguards must be rechecked before any merge. No production deployment is part of this change.

## Generated frontend artifact verification

The Milestone 3.3 branch-scoped GitHub Actions rebuild runs `npm ci`, lint, combat tests and the production Vite build, then commits regenerated `react-dist` and canonical compendium outputs on this development branch only. The release check compares regenerated source bundles against these committed assets. Production deployment remains a separate, manually authorised operation.
