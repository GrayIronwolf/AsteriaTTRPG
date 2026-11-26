# Milestone 3.1 encounter management

This phase extends the existing revision-guarded combat transaction and private GM workspace. It keeps the existing public encounter statuses and uses an additional pause flag.

- A prepared template can include a private description, GM notes, environmental conditions, a reward plan, selected linked characters, initiative mode, map and token placement, enemies, waves and planned events. The preparation notes and staging queue stay GM-only. Environment notes do not assign any automatic gameplay penalties.
- The GM can stage several templates without changing live combat. Loading a reviewed template and starting combat remain separate actions. The quick encounter setup edits the same live engine and can save a fresh reusable template.
- Player End Turn updates the GM's live view without advancing. The GM can skip or change the next participant with a recorded reason. A participant does not get an extra turn or AP refresh because the order changes.
- The GM can pause, resume and correct initiative without resetting the active participant, pending action or AP.
- Completion keeps a server-owned original encounter checkpoint and immutable completion editions. Reopening starts the same encounter paused. Sheet resources retain their current values, and settled reward receipts stay on the original history record. A previously approved reward plan remains approved and is held while the encounter is reopened.
- Manual recovery keeps up to eight named checkpoints per encounter. Restoration changes the saved combat-token positions, fog and initiative only. The roster, linked map, and map geometry must match. Current turn progress, AP, resources, campaign membership, and personal layouts are preserved.
- Legacy completions created before this phase have no exact checkpoint. They remain available in history with their reward receipts. Exact reopening requires a completion recorded by this version.

The new callable commands run through `asteriaAction`. Deployment of the website, this callable, and the updated Firestore rules is a separate owner action. Deploy the backend and rules before enabling this frontend in production. No Storage rules change is required.
