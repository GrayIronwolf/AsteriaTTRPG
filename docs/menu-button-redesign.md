# Crystal-steel menu update

Top navigation controls now use 88px height (previously 44px), 1.56rem text
(previously .78rem) and 36px horizontal padding (previously 18px). The disclosure
arrow is 74px wide and the hamburger is 88px square. Main navigation and account
controls occupy separate rows on ordinary desktop widths; wide screens place
them in one row. Below 1400px, the existing hamburger dialog contains the same
navigation elements. Its content scrolls so the larger buttons remain accessible.

`css/asteria-menu-buttons.css` supplies a shared symmetrical hexagonal frame,
pointed ends, raised steel bevels, charcoal crystal surface and restrained icy-blue
highlights. Selection, hover, pressed, disabled, keyboard-focus and reduced-motion
states are included. It also handles the larger top navigation layout.

`js/asteria-menu-buttons.js` applies the presentation class to existing navigation
nodes: top menus, player/GM dashboard tabs, submenus, Compendium navigation,
Forge/workspace sections, inventory storage tabs and legacy system menus.
Dynamic menus and React selection updates retain the same class. It does not
replace labels, wrap content or change click/keyboard handlers. Resource steppers,
inventory reorder controls and ordinary gameplay action buttons retain their
existing behavior and dimensions.

`js/border-glow.js` leaves these controls' bevel layers under the shared menu
styling. `js/asteria-navigation.js` aligns the existing responsive behavior to the
1400px breakpoint. `index.html` loads the shared CSS/JS and replacement artwork;
the new script is included in the existing lint configuration and command.

`assets/header/asteria-header-v2.webp` is the supplied 9917 banner, optimized to
72,852 bytes at its original 1536 × 144 pixels (32:3 aspect ratio). The complete
strip is visible on desktop, with the figure farther left as supplied. Smaller
screens use proportional cropping. The reference button image guides geometry
only; its skull, horns, spikes and red material are not added to the website.
The existing smoke-background update is retained.

Verification: lint, full existing tests and production build; browser widths
320, 390, 768, 1024, 1200, 1399, 1400, 1440, 1920, 2199, 2200 and 2560px;
88px top control measurements; no page overflow; keyboard and mobile split
navigation; search, favourites, recent pages and history; Account Settings,
Campaign Forge, new-character flow and Logout; player dashboard menu below its
resource panel; Inventory/Skills/Spells selection and arrow-key navigation.
Authenticated UI checks use local fixtures, including the previously documented
test-only refreshCharacterSystems response. Production account data is untouched.
