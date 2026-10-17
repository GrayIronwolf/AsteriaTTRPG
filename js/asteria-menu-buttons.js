/* Presentation only: keep the existing menu nodes, labels and event handlers. */
(function(){
  'use strict';
  const selector=[
    '.crystal-button','[role="tab"]','button[data-view]','button[data-workspace-action]',
    'button[data-workspace-mode]','button[data-workspace-section]','button[data-app-route]',
    '.hero-actions button',
    'nav:not(.react-storage-tabs):not(.library-breadcrumbs) > button',
    '.react-storage-tabs > button','.react-storage-tab > button',
    '.react-filter-tabs button','.react-world-tabs button','.combat-action-tabs button',
    '.tabs button','.category-tabs button','.tab-menu button','.menu-tab','.top-tab',
    '.toplink','.side-main','.phase3-nav button','.phase4-nav button',
    '.clean-nav .clean-buttons button','.clean-nav-buttons button',
    '.codex-tree-category','.codex-tree-entry','.race-tree-category','.race-tree-entry',
    '.gm-system-buttons button','.gm-menu-bar-actions button','.right-menu-buttons button',
    '.spell-tabs-v1722 button','.talent-tier-tabs button',
    '.ecosystem-tabs button','.ecosystem-storage-tabs button',
    '.codex-return','.clean-return','.compendium-library-return','.react-gm-return',
    '.compendium-quick-menu a'
  ].join(',');

  function mark(element){
    if(element?.matches?.(selector) && !element.classList.contains('asteria-menu-button'))element.classList.add('asteria-menu-button');
  }
  function enhance(root){
    mark(root);
    root.querySelectorAll?.(selector).forEach(mark);
  }
  function boot(){
    enhance(document);
    // Native clicks/navigation stay untouched. Enter and Space get the same
    // held-down face as touch/mouse :active, including cancellation on blur.
    let pressed=null;
    function release(){
      pressed?.removeAttribute('data-menu-pressed');pressed=null;
    }
    document.addEventListener('keydown',event=>{
      if(event.key!=='Enter' && event.key!==' ')return;
      const button=event.target.closest?.('.asteria-menu-button');
      if(!button || button.disabled || button.getAttribute('aria-disabled')==='true')return;
      release();pressed=button;pressed.setAttribute('data-menu-pressed','');
    });
    document.addEventListener('keyup',event=>{if(event.key==='Enter' || event.key===' ')release();});
    document.addEventListener('focusout',release);
    document.addEventListener('pointercancel',release);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
    window.addEventListener('blur',release);
    // Legacy viewers and React tabs render after startup. React can also replace
    // className when selection changes; reapply only this presentation class.
    new MutationObserver(records=>{
      records.forEach(record=>{
        if(record.type==='attributes')mark(record.target);
        else record.addedNodes.forEach(node=>{if(node.nodeType===1)enhance(node);});
      });
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','role']});
  }
  window.AsteriaMenuButtons=Object.freeze({selector,enhance});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot):boot();
})();
