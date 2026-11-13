# Digital GM Toolkit Phase 2.3 — Party Management & Dashboard Backups

Scope: usability improvements to the established GM Toolkit. No new campaign
records, permissions, gameplay systems, NPC systems or Obsidian integration.

## Integrated GM party management

- Adds a searchable **Party Management** panel below the existing GM Toolkit.
- Lists party members using the existing campaign party roster and linked
  character records; does not duplicate the Player Resources sidebar.
- Selects characters through the existing GM selection state and launches
  current GM Tools, PC Inventory and Character Dashboard routes. The Campaign
  Manager and party Quests remain the same authoritative workspaces.
- Includes accessible count, empty states and responsive presentation.

## Dashboard layout backup and restore

- Adds **Dashboard Layout Backup & Restore** to the existing GM Dashboard
  Settings section, without altering its existing drag-and-drop editor.
- Downloads a portable JSON file containing only the normalized GM dashboard
  layout, backgrounds, locks, device layouts, named Focus snapshots and current
  Focus metadata. No campaign records, user IDs, private notes or credentials.
- Import accepts Asteria GM dashboard backups only. Validates version, role,
  recognized panel IDs and maximum size (512 KB). Rejects future and malformed
  backups, sanitizes all data through the existing GM layout normalizer.
- Import requires explicit confirmation after previewing visible panel count,
  Focus count and device layouts. Cancel does not save anything.
- Saving a restored layout reuses the existing owner-scoped GM Firestore layout
  document, GM permission checks and Phase 2.2 optimistic save/rollback flow.
- All user/player gameplay state remains untouched.

## Release

`npm run test:gm-phase2-3`, `npm run test:dashboard`, full
`npm test`, lint, Firebase emulators and production reproducibility
verification must pass before merge. React build assets are committed.
The temporary builder workflow is removed before merging.
Deployment is manual; Phase 3 and Obsidian integration are out of scope.
