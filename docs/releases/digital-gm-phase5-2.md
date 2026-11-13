# Digital GM Phase 5.2 — Shop and Inventory Generator

Depends on Phase 5.1 (PR #247), which must pass checks and merge before this feature is released.

## Scope
- Preview a deterministic inventory from the existing Compendium and custom-item catalog.
- Filter by item category, rarity, type and copper-value range.
- Configure stock line count, quantity range, seed and optional restock target.
- Exclude unidentified entries and duplicate item identities.
- GM must explicitly confirm before stock is appended to an existing shop.
- Use existing authenticated GM shop action, pricing normalization and stock caps.
- Preserve existing stock, restocking, trade, currency and merchant relationships.

## Release gates
- Verify 5.1 lint and build failures have been corrected.
- Verify generator tests, lint, build and Firebase tests.
- Review shop stock limits and custom catalog item variants in production-like testing.
- No live Firebase deployment occurs automatically.
