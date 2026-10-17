// Shared dialog keyboard behaviour; native hidden/inert controls never receive focus.
export function trapDialogTab(event, dialog, activeElement) {
  if(event.key !== 'Tab' || !dialog) return;
  const controls = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter(control => control.tabIndex >= 0 && control.getClientRects().length && !control.closest('[hidden],[inert],[aria-hidden="true"]'));
  if(!controls.length) {
    event.preventDefault();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  const outsideControls = !controls.includes(activeElement);
  if(event.shiftKey && (activeElement === first || outsideControls)) {
    event.preventDefault();
    last.focus();
  } else if(!event.shiftKey && (activeElement === last || outsideControls)) {
    event.preventDefault();
    first.focus();
  }
}
