(function(){
  const STORAGE_KEY = "asteria-ui-theme-v1";
  const themes = {
    bloodhunter:{accent:"#b51f2e",glow:.34,overlay:.44,panel:.78},
    cleric:{accent:"#f3d36b",glow:.30,overlay:.40,panel:.78},
    ranger:{accent:"#2f9b55",glow:.28,overlay:.40,panel:.78},
    spellblade:{accent:"#1f7dff",glow:.36,overlay:.44,panel:.78},
    artificer:{accent:"#d1843a",glow:.30,overlay:.40,panel:.78},
    paladin:{accent:"#d8d3bd",glow:.28,overlay:.38,panel:.80},
    druid:{accent:"#17a879",glow:.30,overlay:.40,panel:.78},
    rogue:{accent:"#7b4dff",glow:.34,overlay:.42,panel:.78},
    custom:{accent:"#1f7dff",glow:.36,overlay:.44,panel:.78}
  };

  function clamp(value, min=0, max=1){
    return Math.max(min, Math.min(max, Number(value)));
  }

  function hexToRgb(hex){
    hex = String(hex || "#1f7dff").replace("#", "");
    if(hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const n = parseInt(hex, 16);
    return { r:(n >> 16) & 255, g:(n >> 8) & 255, b:n & 255 };
  }

  function rgba(hex, alpha){
    const rgb = hexToRgb(hex);
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  function setVar(name, value){
    document.documentElement.style.setProperty(name, value);
  }

  function sync(settings){
    const theme = document.getElementById("asteriaThemeSelect");
    const colour = document.getElementById("asteriaColourWheel");
    const glow = document.getElementById("asteriaGlowSlider");
    const overlay = document.getElementById("asteriaOverlaySlider");
    const panel = document.getElementById("asteriaPanelOpacitySlider");

    if(theme) theme.value = settings.theme || "spellblade";
    if(colour) colour.value = settings.accent || "#1f7dff";
    if(glow) glow.value = Math.round((settings.glow ?? .36) * 100);
    if(overlay) overlay.value = Math.round((settings.overlay ?? .44) * 100);
    if(panel) panel.value = Math.round((settings.panel ?? .78) * 100);
  }

  function normalise(settings = {}){
    const key = settings.theme || "spellblade";
    const preset = themes[key] || themes.spellblade;
    return {
      theme:key,
      accent:settings.accent || preset.accent,
      glow:clamp(typeof settings.glow === "number" ? settings.glow : preset.glow),
      overlay:clamp(typeof settings.overlay === "number" ? settings.overlay : preset.overlay),
      panel:clamp(typeof settings.panel === "number" ? settings.panel : preset.panel, .62, .92)
    };
  }

  function applyTheme(settings, persist=false){
    const next = normalise(settings);
    const rgb = hexToRgb(next.accent);
    const inverseVisibility = 1 - next.overlay;
    const topVeil = clamp(.12 + inverseVisibility * .28, .12, .46);
    const bottomVeil = clamp(.34 + inverseVisibility * .34, .34, .76);

    setVar("--asteria-accent", next.accent);
    setVar("--accent", next.accent);
    setVar("--asteria-accent-rgb", `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    setVar("--asteria-accent-soft", rgba(next.accent, .22));
    setVar("--asteria-accent-faint", rgba(next.accent, .10));
    setVar("--asteria-glow", rgba(next.accent, next.glow));
    setVar("--asteria-glow-strong", rgba(next.accent, Math.min(.72, next.glow + .20)));
    setVar("--asteria-glow-intensity", String(next.glow));
    setVar("--asteria-overlay-opacity", String(next.overlay));
    setVar("--asteria-background-visibility", String(next.overlay));
    setVar("--asteria-bg-top-veil", String(topVeil));
    setVar("--asteria-bg-bottom-veil", String(bottomVeil));
    setVar("--asteria-panel-opacity", String(next.panel));
    setVar("--panel-bg", `rgba(4,14,16,${next.panel})`);
    setVar("--panel-border", rgba(next.accent, .46));

    document.body.dataset.asteriaTheme = next.theme;
    document.body.removeAttribute("data-theme");
    document.body.removeAttribute("data-accent");
    sync(next);
    if(persist) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function current(){
    const theme = document.getElementById("asteriaThemeSelect")?.value || document.body.dataset.asteriaTheme || "spellblade";
    const preset = themes[theme] || themes.spellblade;
    return normalise({
      theme,
      accent:document.getElementById("asteriaColourWheel")?.value || preset.accent,
      glow:Number(document.getElementById("asteriaGlowSlider")?.value ?? Math.round(preset.glow * 100)) / 100,
      overlay:Number(document.getElementById("asteriaOverlaySlider")?.value ?? Math.round(preset.overlay * 100)) / 100,
      panel:Number(document.getElementById("asteriaPanelOpacitySlider")?.value ?? Math.round((preset.panel || .78) * 100)) / 100
    });
  }

  function bind(){
    const theme = document.getElementById("asteriaThemeSelect");
    const colour = document.getElementById("asteriaColourWheel");
    const glow = document.getElementById("asteriaGlowSlider");
    const overlay = document.getElementById("asteriaOverlaySlider");
    const panel = document.getElementById("asteriaPanelOpacitySlider");
    const save = document.getElementById("asteriaThemeSave");
    const reset = document.getElementById("asteriaThemeReset");

    if(theme && !theme.dataset.bound){
      theme.dataset.bound = "1";
      theme.addEventListener("change", () => {
        const preset = themes[theme.value] || themes.spellblade;
        const live = current();
        applyTheme({theme:theme.value,accent:preset.accent,glow:preset.glow,overlay:preset.overlay,panel:live.panel}, true);
      });
    }
    if(colour && !colour.dataset.bound){
      colour.dataset.bound = "1";
      colour.addEventListener("input", () => {
        const live = current();
        live.theme = "custom";
        live.accent = colour.value;
        applyTheme(live, false);
      });
      colour.addEventListener("change", () => {
        const live = current();
        live.theme = "custom";
        live.accent = colour.value;
        applyTheme(live, true);
      });
    }
    if(glow && !glow.dataset.bound){
      glow.dataset.bound = "1";
      glow.addEventListener("input", () => {
        const live = current();
        live.glow = Number(glow.value) / 100;
        applyTheme(live, false);
      });
      glow.addEventListener("change", () => applyTheme(current(), true));
    }
    if(overlay && !overlay.dataset.bound){
      overlay.dataset.bound = "1";
      overlay.addEventListener("input", () => {
        const live = current();
        live.overlay = Number(overlay.value) / 100;
        applyTheme(live, false);
      });
      overlay.addEventListener("change", () => applyTheme(current(), true));
    }
    if(panel && !panel.dataset.bound){
      panel.dataset.bound = "1";
      panel.addEventListener("input", () => {
        const live = current();
        live.panel = Number(panel.value) / 100;
        applyTheme(live, false);
      });
      panel.addEventListener("change", () => applyTheme(current(), true));
    }
    if(save && !save.dataset.bound){
      save.dataset.bound = "1";
      save.addEventListener("click", () => applyTheme(current(), true));
    }
    if(reset && !reset.dataset.bound){
      reset.dataset.bound = "1";
      reset.addEventListener("click", () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem("asteria-theme");
        localStorage.removeItem("asteria-accent");
        applyTheme({theme:"spellblade", ...themes.spellblade}, true);
      });
    }
  }

  function boot(){
    localStorage.removeItem("asteria-theme");
    localStorage.removeItem("asteria-accent");
    let saved = null;
    try{ saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }catch(e){}
    applyTheme(saved || {theme:"spellblade", ...themes.spellblade}, false);
    bind();
    setInterval(bind, 1000);
  }

  window.AsteriaThemeSystem = {
    themes,
    applyTheme,
    reset(){
      localStorage.removeItem(STORAGE_KEY);
      applyTheme({theme:"spellblade", ...themes.spellblade}, true);
    }
  };

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
