(function () {
  'use strict';
  // Legacy tools retain native numeric validation, but never step an amount
  // accidentally with arrow keys or a mouse wheel. React uses text drafts.
  document.addEventListener('keydown', function (event) {
    if(event.target?.matches?.('input[type="number"]') &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')) event.preventDefault();
  });
  document.addEventListener('wheel', function (event) {
    if(event.target === document.activeElement && event.target?.matches?.('input[type="number"]')) {
      event.target.blur();
    }
  }, { capture: true, passive: true });
})();
