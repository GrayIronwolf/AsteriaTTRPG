/* Asteria view hook registry.
   Lets feature modules refresh after navigation without repeatedly replacing setView. */
(function(){
  const viewHooks = [];
  const beforePlayerLoadHooks = [];
  const playerLoadHooks = [];
  const gmRenderHooks = [];
  const beforeGMPlayerRenderHooks = [];
  const gmPlayerRenderHooks = [];

  function toViewSet(views){
    if(!views) return null;
    return new Set(Array.isArray(views) ? views : [views]);
  }

  function runHook(hook, view, context){
    try{
      hook.fn(view, context || {});
    }catch(error){
      console.warn('Asteria view hook failed:', hook.name, error);
    }
  }

  function addRenderHook(store, name, fn, options){
    if(typeof fn !== 'function') return;
    store.push({
      name: name || 'anonymous-render-hook',
      fn,
      defer: options?.defer !== false
    });
  }

  function runRenderHooks(store, value, context, label){
    store.forEach(hook => {
      const run = () => {
        try{
          hook.fn(value, context || {});
        }catch(error){
          console.warn(label, hook.name, error);
        }
      };
      if(hook.defer) setTimeout(run, 0);
      else run();
    });
  }

  window.AsteriaViewHooks = window.AsteriaViewHooks || {
    afterView(name, views, fn, options){
      if(typeof fn !== 'function') return;
      viewHooks.push({
        name: name || 'anonymous-view-hook',
        views: toViewSet(views),
        fn,
        defer: options?.defer !== false
      });
    },
    runView(view, context){
      viewHooks.forEach(hook => {
        if(hook.views && !hook.views.has(view)) return;
        if(hook.defer) setTimeout(() => runHook(hook, view, context), 0);
        else runHook(hook, view, context);
      });
    },
    beforePlayerLoad(name, fn, options){
      addRenderHook(beforePlayerLoadHooks, name, fn, options);
    },
    runBeforePlayerLoad(characterId, context){
      runRenderHooks(beforePlayerLoadHooks, characterId, context, 'Asteria before-player hook failed:');
    },
    afterPlayerLoad(name, fn, options){
      addRenderHook(playerLoadHooks, name, fn, options);
    },
    runPlayerLoad(characterId, context){
      runRenderHooks(playerLoadHooks, characterId, context, 'Asteria player hook failed:');
    },
    afterGMRender(name, fn, options){
      addRenderHook(gmRenderHooks, name, fn, options);
    },
    runGMRender(context){
      runRenderHooks(gmRenderHooks, 'gm', context, 'Asteria GM hook failed:');
    },
    beforeGMPlayerRender(name, fn, options){
      addRenderHook(beforeGMPlayerRenderHooks, name, fn, options);
    },
    runBeforeGMPlayerRender(characterId, context){
      runRenderHooks(beforeGMPlayerRenderHooks, characterId, context, 'Asteria GM player before-hook failed:');
    },
    afterGMPlayerRender(name, fn, options){
      addRenderHook(gmPlayerRenderHooks, name, fn, options);
    },
    runGMPlayerRender(characterId, context){
      runRenderHooks(gmPlayerRenderHooks, characterId, context, 'Asteria GM player hook failed:');
    },
    list(){
      const mapRenderHook = hook => ({ name: hook.name, defer: hook.defer });
      return {
        view: viewHooks.map(hook => ({
          name: hook.name,
          views: hook.views ? Array.from(hook.views) : ['*'],
          defer: hook.defer
        })),
        beforePlayerLoad: beforePlayerLoadHooks.map(mapRenderHook),
        playerLoad: playerLoadHooks.map(mapRenderHook),
        gmRender: gmRenderHooks.map(mapRenderHook),
        beforeGMPlayerRender: beforeGMPlayerRenderHooks.map(mapRenderHook),
        gmPlayerRender: gmPlayerRenderHooks.map(mapRenderHook)
      };
    }
  };
})();
