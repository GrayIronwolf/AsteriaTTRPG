# Advanced Dice Phase 2 — generated-bundle verification follow-up

## Cause of the failing workflow

The `Firebase and website checks` run [45094111848](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45094111848) checked out source commit `6bde7a5d27b36119e79df3bbed6d1a77472428cc`.

All preceding validation steps, including `npm run build`, completed. The final step `git diff --exit-code -- react-dist data/compendium.js data/compendium-handbook.js data/compendium-index.js data/compendium-parts` failed because the React build differed from the checked-in compiled artifacts. The diff specifically reported `react-dist/asteria-react-content-v2.js` and `react-dist/asteria-react-royal-relic-v23.css`.

This was a generated-asset timing issue: the separately scheduled dedicated build workflow was still working. Dedicated dice workflow [45094111910](https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/45094111910) passed the 16 dice unit tests, 10 browser checks, lint and Vite build and committed the generated assets as `7ce393fc9cb9418f6cff445de272252f23ecb005`.

The generated-asset commit includes the freshly built chunk files and updated entry/CSS. It did not change the source gameplay rules, Firestore rules, or Firebase backend.

## Resolution and CI expectations

The generated bundle is committed to `Website-Build-Test`. A new standard full-site CI validation should check the synchronized branch state. The earlier CI run will remain red historically, because GitHub Actions checks the immutable commit it originally checked out.

Do not delete the bundle consistency check or suppress its failures. Future changes that modify React/Vite source should always have compiled assets committed before considering full-site CI passed; otherwise parallel source and build workflows can show a temporary red run.

## Scope

- Test branch only.
- No live Firebase deploy.
- Dedicated Phase 2 tests: 16 unit assertions and 10 Chromium browser checks succeeded.
- Phase 2 final full-site verification: see latest run on this document commit.
