# Shared UI keyboard fixes — verification

## Result

Closed mobile navigation and settings panels now leave the keyboard focus order. Opening them restores their controls; desktop navigation remains accessible.

React dialogs now capture forward and backward Tab from their initially focused container, wrap at the first/last control, and exclude hidden, inert and negative-tab-index controls. Existing Escape, busy-state and return-focus behaviour is retained.

The static shell script URL is versioned, the production React bundle is regenerated, and `npm test` includes five new regression tests through `test:ui`.

## Checks run on 17 October 2026

| Check | Result |
| --- | --- |
| Complete `npm test`, including the five new UI tests | Passed |
| `npm run lint` | Passed |
| `npm run content:check` | Passed: 886 entries, zero errors, 98 existing content gaps |
| Live XP/loot check | Passed |
| Data-sync regression suite | Passed |
| Firebase Auth/Firestore/Storage emulator suite | Passed: 59 tests, no failures or skipped tests |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Uploaded Git tree compared with the locally tested tree | Matched before commit |

Local verification used Node 24. The repository's existing GitHub workflow uses Node 22; its result is tracked on the pull request.

## Limits

- This small repair does not complete the wider Phases 1–5 redesign. Existing working dashboard, combat, talent and compendium features remain in place.
- No Firebase configuration, rules, Functions, gameplay rules, saved data or hosting configuration changed. No production deployment was run.
- Figma component/design work could not proceed because its Starter-plan MCP tool quota was exhausted.
- Browser visual QA was unavailable. Playwright's Chromium installation returned an invalid/empty download with `End of central directory record signature not found`, followed by `Failed to install browsers`. No screenshots or production browser interactions are claimed.
- Detailed project instructions and private external source material are excluded from this public repository change.
