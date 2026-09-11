# Quest workflow upgrade

Quests now support required and optional objectives, counted progress, tracking, quest giver, location, category, an in-world deadline, success outcomes, failure consequences, and private GM preparation notes. New quests require GM approval by default. Players submit completed objectives; the GM approves and awards rewards, returns the quest to Active with feedback, or marks it Failed. Deadlines are descriptive world-time text: the GM decides when they have passed.

## Behaviour and data

- GM templates remain in `campaigns/{campaignId}/systems/gmWorkspace.quests`. Private GM notes stay here, protected by the existing GM-only rules. Assignments whitelist public definition fields.
- Per-character assignments remain in `campaigns/{campaignId}/characters/{characterId}.quests`. No new collection or composite query is required. Objective IDs are stable; progress is stored by objective ID.
- Saving a template prepares its definition. **Send to Selected Players** applies it to recipients. Re-sending preserves their status, progress, original assignment date, tracking, history, and reward claims. New required objectives return an incomplete pending review to Active.
- The player quest log gives assigned records precedence over shared party summaries. Shared summaries alone do not expose mutation controls.
- Progress and status mutations use the existing authenticated `asteriaAction` callable. Players may update only their own character during an active session. They cannot edit reward definitions or self-approve quests that require GM review.
- GM review uses a narrow action-specific exception: the caller must manage the campaign and the stored campaign links must agree with the character's actual owner. Other callable actions retain their owner checks. Review writes the live record and the existing private record under the actual owner's UID, never a GM-owned copy. A missing private character is not recreated.
- Reward progression, currency, items, claim marker, owner mirror, and review notification are committed in one transaction. Concurrent approvals do not duplicate rewards. Insufficient inventory space aborts the whole approval so it can be retried after the player makes room.
- Existing snapshot listeners carry updates back to both dashboards. Tracking does not grant rewards. Completed quests are terminal; duplicate a template for a repeat adventure. Archiving a template preserves player assignments and review history.

## Compatibility and migration

No bulk migration is required. Existing quests without `requiresGMApproval: true` retain their self-completion behaviour. A GM can edit an older template, enable approval, and re-send it; existing completed status and claimed rewards remain preserved. New objective counts default to one only when the GM leaves the count blank; reward inputs remain blank until typed.

Firestore rules, indexes, Storage rules, Firebase configuration, Authentication, and `asteriaInvite` are unchanged. This release requires updated **`asteriaAction` code** before the new frontend goes live.

## Production rollout

Use an authenticated Firebase CLI session in a checkout of `feat/quest-workflow` (the directory containing `firebase.json`). From that directory, with Node 22:

```sh
npm ci
npm test
npm run test:firebase
npm run build
npx --no-install firebase deploy --project asteria-ttrpg --only functions:asteriaAction
npx --no-install firebase functions:list --project asteria-ttrpg
```

On Windows PowerShell, use `npx.cmd` instead of `npx` if script execution policy blocks the latter. Run each line separately. This deploys only the updated action function; no rules, indexes, Storage, hosting, or invitation deployment is needed.

**Deploy the function from this branch before merging the frontend PR.** The old backend does not understand objective progress or GM review and does not enforce the new approval flag. After successful function deployment, merge the PR and let the existing website publication workflow finish. Refresh both GM and player tabs so they load the same release. Never put Firebase CLI login tokens or service-account files in GitHub or chat.

Deployment and authenticated production checks cannot be performed from a workspace that has only GitHub access. Local emulator success is not evidence of a production deployment.

## Checks before the session

Use a disposable quest on test characters with an active session:

1. GM creates a quest with one required counted objective, one optional objective, a small reward, private notes, and GM approval enabled. Assign it to the player.
2. Player sees the public details but no private notes. Enter progress in a blank number box, submit, and verify rewards have not arrived yet.
3. GM sees Awaiting Review and the actual assigned reward. Approve; verify the player receives it once and both dashboards update. Refresh and verify no repeat award.
4. Re-send the same quest. Confirm completion, progress, and claimed reward remain intact.
5. Test returning a submission with feedback and marking a separate quest Failed. Confirm the player sees the outcome.
6. Check that the GM's Character Forge still lists only GM-owned characters and that a campaign dashboard visit remains read-only with its existing return navigation.

Automated coverage includes quest model/component tests, the existing website/ownership/blank-input regressions, and Firestore/Auth/Storage emulator tests for authorization, live snapshots, concurrent approvals, private mirrors, legacy completion, invalid input, paused sessions, and atomic inventory failure. Browser/device and authenticated production checks remain rollout tasks.
