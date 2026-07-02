/* Asteria BorderGlow
   Framework-free adapter for the React Bits BorderGlow interaction. */
(function(){
  'use strict';

  const DEFAULTS = {
    edgeSensitivity:30,
    glowColor:'theme',
    backgroundColor:'rgba(4, 14, 16, var(--asteria-panel-opacity, .78))',
    borderRadius:8,
    glowRadius:24,
    glowIntensity:1,
    coneSpread:22,
    animated:false,
    colors:['var(--asteria-accent, #1f7dff)', 'color-mix(in srgb, var(--asteria-accent, #1f7dff) 46%, #d4a24a)', 'color-mix(in srgb, var(--asteria-accent, #1f7dff) 70%, white)'],
    fillOpacity:.18
  };

  const AUTO_SELECTOR = [
    '[data-border-glow]',
    '[class$="-card"]',
    '[class*="-card "]',
    '[class$="-panel"]',
    '[class*="-panel "]',
    '[class$="-box"]',
    '[class*="-box "]',
    '[class$="-window"]',
    '[class*="-window "]',
    '[class$="-viewer"]',
    '[class*="-viewer "]',
    'button[class*="tab"]',
    '[role="tab"]',
    '.card',
    '.panel',
    '.box',
    '.tile',
    '.codex-card',
    '.codex-compendium-header',
    '.codex-search-filter-bar',
    '.codex-card-grid-panel',
    '.codex-detail-page',
    '.codex-sidebar',
    '.codex-tree-category',
    '.codex-tree-entry',
    '.codex-detail-tabs button',
    '.codex-talent-card',
    '.codex-talent-preview',
    '.codex-talent-tier',
    '.codex-talent-modal',
    '.codex-talent-rank-tabs button',
    '.clean-card',
    '.clean-compendium-shell',
    '.clean-page-viewer',
    '.item-card',
    '.item-category-card',
    '.race-card',
    '.race-category-tree',
    '.race-tree-category',
    '.race-tree-entry',
    '.phase3-card',
    '.phase3-header',
    '.phase3-layout',
    '.phase3-preview-card',
    '.phase3-nav button',
    '.phase3-tabs button',
    '.phase3-pick-card',
    '.phase3-stepper button',
    '.phase4-card',
    '.phase4-header',
    '.phase4-layout',
    '.phase4-map-card',
    '.phase4-nav button',
    '.phase4-tabs button',
    '.phase4-chip-list button',
    '.dashboard-card',
    '.workspace-card',
    '.workspace-panel',
    '.workspace-tabs button',
    '.workspace-tab-context',
    '.workspace-category-panel',
    '.workspace-display-window',
    '.workspace-link-panel',
    '.workspace-viewer',
    '.codex-info-panel',
    '.codex-gallery-panel',
    '.settings-panel',
    '.theme-settings-section',
    '.theme-live-preview',
    '.top-menu-btn',
    '#loginToggle',
    '.side-main',
    '.clean-magic-element-card',
    '.campaign-card',
    '.roster-btn',
    '.gm-system-buttons button',
    '.gm-menu-bar-actions button',
    '.resource-action-buttons button',
    '.combat-state-grid button',
    '.combat-control-grid button',
    '.enemy-card-actions button',
    '.tab',
    '.tabs button',
    '.tab-menu button',
    '.menu-tab',
    '.top-tab',
    '.player-dashboard-grid > .card',
    '#gm .card',
    '#gmPlayer .card'
  ].join(',');

  const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
  const GRADIENT_KEYS = ['--gradient-one', '--gradient-two', '--gradient-three', '--gradient-four', '--gradient-five', '--gradient-six', '--gradient-seven'];
  const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

  function parseHSL(hslStr){
    const match = String(hslStr || '').match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
    if(!match) return { h:195, s:100, l:62 };
    return { h:parseFloat(match[1]), s:parseFloat(match[2]), l:parseFloat(match[3]) };
  }

  function buildGlowVars(glowColor, intensity){
    if(glowColor === 'theme'){
      const opacities = [1, .6, .5, .4, .3, .2, .1];
      const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
      const vars = {};
      for(let i = 0; i < opacities.length; i++){
        vars[`--glow-color${keys[i]}`] = `rgba(var(--asteria-accent-rgb, 31, 125, 255), calc(${(opacities[i] * intensity).toFixed(3)} * var(--asteria-border-glow-strength, 1)))`;
      }
      return vars;
    }
    const { h, s, l } = parseHSL(glowColor);
    const base = `${h}deg ${s}% ${l}%`;
    const opacities = [100, 60, 50, 40, 30, 20, 10];
    const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
    const vars = {};
    for(let i = 0; i < opacities.length; i++){
      vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
    }
    return vars;
  }

  function buildGradientVars(colors){
    const usable = Array.isArray(colors) && colors.length ? colors : DEFAULTS.colors;
    const vars = {};
    for(let i = 0; i < 7; i++){
      const color = usable[Math.min(COLOR_MAP[i], usable.length - 1)];
      vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${color} 0px, transparent 50%)`;
    }
    vars['--gradient-base'] = `linear-gradient(${usable[0]} 0 100%)`;
    return vars;
  }

  function easeOutCubic(x){ return 1 - Math.pow(1 - x, 3); }
  function easeInCubic(x){ return x * x * x; }

  function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }){
    const t0 = performance.now() + delay;
    function tick(){
      const elapsed = performance.now() - t0;
      const t = Math.min(elapsed / duration, 1);
      onUpdate(start + (end - start) * ease(t));
      if(t < 1) requestAnimationFrame(tick);
      else if(onEnd) onEnd();
    }
    setTimeout(() => requestAnimationFrame(tick), delay);
  }

  function numberValue(value, fallback){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function datasetOptions(el, options){
    const data = el.dataset || {};
    const colors = data.borderGlowColors
      ? data.borderGlowColors.split(',').map(color => color.trim()).filter(Boolean)
      : options.colors;
    return {
      edgeSensitivity:numberValue(data.borderGlowEdgeSensitivity ?? options.edgeSensitivity, DEFAULTS.edgeSensitivity),
      glowColor:data.borderGlowColor || options.glowColor || DEFAULTS.glowColor,
      backgroundColor:data.borderGlowBackgroundColor || options.backgroundColor || DEFAULTS.backgroundColor,
      borderRadius:numberValue(data.borderGlowBorderRadius ?? options.borderRadius, DEFAULTS.borderRadius),
      glowRadius:numberValue(data.borderGlowRadius ?? options.glowRadius, DEFAULTS.glowRadius),
      glowIntensity:numberValue(data.borderGlowIntensity ?? options.glowIntensity, DEFAULTS.glowIntensity),
      coneSpread:numberValue(data.borderGlowConeSpread ?? options.coneSpread, DEFAULTS.coneSpread),
      animated:data.borderGlowAnimated === 'true' || options.animated === true,
      colors,
      fillOpacity:numberValue(data.borderGlowFillOpacity ?? options.fillOpacity, DEFAULTS.fillOpacity)
    };
  }

  function setVars(el, vars){
    Object.entries(vars).forEach(([key, value]) => el.style.setProperty(key, value));
  }

  function getCenterOfElement(el){
    const { width, height } = el.getBoundingClientRect();
    return [width / 2, height / 2];
  }

  function getEdgeProximity(el, x, y){
    const [cx, cy] = getCenterOfElement(el);
    const dx = x - cx;
    const dy = y - cy;
    let kx = Infinity;
    let ky = Infinity;
    if(dx !== 0) kx = cx / Math.abs(dx);
    if(dy !== 0) ky = cy / Math.abs(dy);
    return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
  }

  function getCursorAngle(el, x, y){
    const [cx, cy] = getCenterOfElement(el);
    const dx = x - cx;
    const dy = y - cy;
    if(dx === 0 && dy === 0) return 0;
    const radians = Math.atan2(dy, dx);
    let degrees = radians * (180 / Math.PI) + 90;
    if(degrees < 0) degrees += 360;
    return degrees;
  }

  function ensureEdgeLight(el){
    let light = Array.from(el.children).find(child => child.classList?.contains('edge-light'));
    if(!light){
      light = document.createElement('span');
      light.className = 'edge-light';
      light.setAttribute('aria-hidden', 'true');
      el.insertBefore(light, el.firstChild);
    }
  }

  function animateIntro(el){
    if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const angleStart = 110;
    const angleEnd = 465;
    el.classList.add('sweep-active');
    el.style.setProperty('--cursor-angle', `${angleStart}deg`);
    animateValue({ duration:500, onUpdate:value => el.style.setProperty('--edge-proximity', value) });
    animateValue({ ease:easeInCubic, duration:1500, end:50, onUpdate:value => {
      el.style.setProperty('--cursor-angle', `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`);
    }});
    animateValue({ ease:easeOutCubic, delay:1500, duration:2250, start:50, end:100, onUpdate:value => {
      el.style.setProperty('--cursor-angle', `${(angleEnd - angleStart) * (value / 100) + angleStart}deg`);
    }});
    animateValue({ ease:easeInCubic, delay:2500, duration:1500, start:100, end:0,
      onUpdate:value => el.style.setProperty('--edge-proximity', value),
      onEnd:() => el.classList.remove('sweep-active')
    });
  }

  function apply(el, options = {}){
    if(!el || el.dataset.borderGlowBound === 'true') return el;
    if(el.matches?.('input,select,textarea,option,img,svg,canvas,.edge-light,.bar,.meter,.mini-meter,.hp,.sp,.mp,.xp,.hp-bar,.sp-bar,.mp-bar,.xp-bar,[data-resource]')) return el;
    const cls = typeof el.className === 'string' ? el.className : '';
    if(/\b(?:codex-card-grid|card-grid|grid|list|row|head|content|image|art|icon|name|subtitle|ranks|resource-stack|stat-row|meter|bar|actions)\b/.test(cls)) return el;
    const isCompactControl = el.tagName === 'BUTTON' && !/(^|\s)[\w-]*-card(\s|$)/.test(cls);
    const opts = datasetOptions(el, { ...DEFAULTS, ...options });
    const currentPosition = getComputedStyle(el).position;
    ensureEdgeLight(el);
    el.classList.add('border-glow-card');
    if(isCompactControl) el.classList.add('border-glow-control');
    el.dataset.borderGlowBound = 'true';
    setVars(el, {
      '--border-glow-position':currentPosition && currentPosition !== 'static' ? currentPosition : 'relative',
      '--card-bg':opts.backgroundColor,
      '--edge-sensitivity':opts.edgeSensitivity,
      '--border-radius':`${opts.borderRadius}px`,
      '--glow-padding':`${opts.glowRadius}px`,
      '--cone-spread':opts.coneSpread,
      '--fill-opacity':opts.fillOpacity,
      ...buildGlowVars(opts.glowColor, opts.glowIntensity),
      ...buildGradientVars(opts.colors)
    });
    el.addEventListener('pointermove', event => {
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const edge = getEdgeProximity(el, x, y);
      const angle = getCursorAngle(el, x, y);
      el.style.setProperty('--edge-proximity', `${(edge * 100).toFixed(3)}`);
      el.style.setProperty('--cursor-angle', `${angle.toFixed(3)}deg`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--edge-proximity', '0');
    });
    if(opts.animated) animateIntro(el);
    return el;
  }

  function applyAll(root = document, options = {}){
    Array.from(root.querySelectorAll?.(AUTO_SELECTOR) || []).forEach(el => apply(el, options));
  }

  function startObserver(){
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if(node.nodeType !== 1) return;
          if(node.matches?.(AUTO_SELECTOR)) apply(node);
          applyAll(node);
        });
      });
    });
    observer.observe(document.body, { childList:true, subtree:true });
    return observer;
  }

  window.AsteriaBorderGlow = {
    apply,
    applyAll,
    refresh:() => applyAll(document),
    parseHSL,
    buildGlowVars,
    buildGradientVars
  };

  document.addEventListener('DOMContentLoaded', () => {
    applyAll(document);
    startObserver();
  });
})();
