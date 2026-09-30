# Character talent bubble graph

The existing React talent tree now shows a connected hierarchy: a large class
bubble, five medium tier bubbles, smaller talent bubbles, and individual Rank
I–V bubbles. Desktop arranges each class around a central hub. Mobile uses
narrower vertical branches within the same pan-and-zoom viewport. All selected
classes stay on one canvas.

Class and tier bubbles focus their branches. Talent and rank bubbles open the
existing Talent Details panel at the selected rank. Search, class/tier shortcuts,
fit-to-view, reset, pointer dragging, pinch zoom, Ctrl/Command-wheel zoom and
keyboard navigation are available. Purchasing keeps the current graph position.

Purchased, available and locked ranks remain visible. Purchased ranks have check
marks; locked ranks use dashed outlines and can still be inspected. Resolvable
authored prerequisites connect the required rank to the dependent talent with
dashed directional lines. Other prerequisite text remains in the existing detail
panel and retains the existing validation behaviour. Empty tiers remain visible.

The layout references canonical catalog records; it does not create talent or
rank data. Talent Details, TP pricing, rank progression, resource costs, effects,
session/ownership checks and Firebase purchase/use actions are unchanged. Styling
uses the shared theme tokens and scoped state classes so legacy hidden-navigation
styles cannot hide locked graph nodes.

Regression coverage checks canonical identity, all classes/tiers/ranks,
prerequisite endpoints, layout bounds and overlap, cursor-centred zoom and camera
fitting. The existing talent tests continue checking costs, progression and
effects. The disposable preview at `/scripts/fixtures/talent-preview.html`
supports single/multiclass characters, level changes and paused sessions. It does
not connect to a real campaign.

Release the source and generated `react-dist` files together through the current
website release process. This presentation change requires no Firebase rules,
Cloud Functions deployment or data migration.
