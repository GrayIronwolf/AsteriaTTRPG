# Phase 3.1 Verification — Catalogue Foundation

**Branch:** `Website-Build-Test`  
**Current status:** Phase 3.1 implementation committed; dedicated integration suite passed.  
**Scope:** No live Firebase deployment. No Stage 3.2 or tray/tower feature work.

## Delivered
- Version 1 appearance schema and strict validator
- 12 core and 2 special dice family definitions
- Eye and cat-specific configurable fields
- Eight shared material PBR parameter definitions; texture assets intentionally not yet made
- Six unplanned tray slots and six unplanned tower slots (design decisions deferred)
- Per-die-type appearance overrides and future appearance-collection validation
- Existing Open Dice adapter uses unchanged legacy colour style through the new material adapter
- The current server-authoritative roll calculations remain unchanged

## Validation
- First Phase 3.1 run exposed one test assertion that expected a different error string for correctly rejected mismatched special-dice data.
- The test expectation was fixed without loosening the validation.
- Dedicated Phase 3.1 run: [45098515188](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45098515188) succeeded. It includes dice unit tests, lint, Vite build and Phase 2 Chromium regression.
- A generated-asset sync commit was created by the dedicated build. The full-site check for the **synchronized** source and React/Vite bundle is separately verified on the latest documentation commit.

## Owner approval gate
Do not start Phase 3.2 until the owner approves. The six tray and six tower appearance designs will be planned in their respective later phases.
