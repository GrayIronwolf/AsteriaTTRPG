# New character dashboard and campaign linking

This follows the dashboard integration merged in PR #11. The reported case was
an unassigned second character, Ty, whose dashboard and campaign link failed
while an older linked character continued working.

## Reproduced causes and changes

- The production React dashboard required a campaign ID. Older entry points
  opened a legacy player view hidden by the React migration. All character
  entry points now use the React route; an unassigned character opens the same
  dashboard using its authenticated owner's private sheet. Gameplay remains
  disabled until the character is linked and the campaign session permits it.
- Forge started linking before its asynchronous character save finished.
  Saving now completes first, failed saves preserve the draft and character ID
  for retry, and pending campaign joins clear only after a successful link.
- Linking assumed the private sheet already existed. The browser transaction
  now creates it and the campaign link atomically when needed. Existing private
  gameplay fields are preserved; relinking remains idempotent.
- Rules evaluated optional legacy campaign roster maps as required properties.
  Safe empty defaults allow these campaigns to accept another owned character.
  Atomic creation checks the private sheet's post-transaction owner. Membership
  and ownership restrictions remain enforced.
- The campaign UI now waits for the transaction before changing local links.
  Failed attempts preserve previous associations and report the failure.

The private dashboard does not subscribe to campaign information or perform
automatic gameplay saves. It rejects foreign characters, including legacy
private mirrors whose shared source belongs to another owner. The campaign link
picker defaults to the selected character.

## Verification

- Full `npm test`, lint and production build passed.
- All 59 Firebase emulator tests passed. Added cases run the actual browser
  linking transaction and subscription against the rules: a second character,
  an unfinished first save, sparse legacy rosters, repeated linking, preservation
  of existing gameplay and rejection of foreign owners/nonmembers.
- Forge tests cover save/link ordering, retry identity, pending joins and
  preservation of earlier links. Dashboard tests cover the private preview and
  ownership denial.
- Desktop and 390px mobile browser fixtures exercised Ty's unassigned dashboard,
  character information, multiclass talents, campaign navigation and the older
  character's existing live route. No browser errors, horizontal overflow,
  automatic private writes or campaign subscriptions occurred in the preview.

Tests used disposable fixtures and emulator data, not the reported production
characters. Production data has not been changed.

## Release

Ship the JavaScript source and committed `react-dist` bundles together through
the existing website release path. Deploy the updated `firestore.rules` as well;
publishing only the frontend leaves the legacy-roster permission failure in
place. The existing manual Firebase backend workflow can deploy the rules after
merge, or an authorized maintainer can deploy only Firestore rules to the
configured production project. No new Cloud Functions or data migration are
required by this fix.

Existing characters should be retained. After release, reload the website, open
Ty from Character Forge, choose **Link a campaign**, and link Ty to the test
campaign. The dashboard switches to its existing live campaign route when the
saved linkage arrives.
