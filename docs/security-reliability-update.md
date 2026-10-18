# Security and reliability update

## Dependencies and checks

Upgrade Firebase Admin to 14.5 and Firebase Functions to 7.4 on the existing Node 22 production runtime. Refresh the lockfile, including patched proxy-addr, node-forge, gRPC, UUID and brace-expansion dependencies. `npm run audit:production` checks production dependencies at moderate severity or higher. Both verification and manual production-deployment workflows run this gate. Dependabot checks npm and Actions weekly.

## Owner-verified character-link recovery

Campaign Forge → Manage character links on the campaign card → Repair Existing Character Link. A character detail also links to campaign management. Select the existing campaign character and press Verify Ownership & Repair Link. After success, the GM can use Add linked players.

The authenticated callable reads the campaign, shared character and that shared record's existing private-source reference in a transaction. Membership, the shared owner, existing private owner and a saved campaign backlink must all verify. A GM cannot repair someone else's character. No owner IDs, private/shared character sheets, HP, XP, inventory, source IDs or campaign roles are changed. Only stale campaign indexes are reconciled, with replay-safe action receipts. Missing/deleted records or unverifiable ownership are rejected. A user's existing multi-campaign backlinks remain supported.

No production records are repaired merely by deployment. The actual owner must invoke the verified operation.

## Validation and deployment

The full website suite, lint, production build, live XP/sync regressions and 65 Firebase emulator integration tests passed for the prepared changes. Browser checks verified recovery controls, server rejection/success feedback and unchanged HP. The release retains the existing 886-entry public Compendium; no private-source Handbook text is included.

Merge triggers GitHub Pages for website assets. The backend and dependency changes require the existing Deploy Firebase backend (manual) workflow on main. Its firebase-production environment and Workload Identity Federation gate remain unchanged. No security permissions, database rules, workflow triggers or credentials are broadened.
