/* Phase 4.1 read-only GM roster, no writes and no untrusted HTML. */
(function(){
  'use strict';
  const groups=[
    {key:'active',title:'Active Members',empty:'No active accounts.'},
    {key:'pending',title:'Pending Requests',empty:'No pending requests.'},
    {key:'inactive',title:'Inactive Members',empty:'No inactive accounts.'}
  ];
  function node(tag,value,cls){
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined && value!==null)el.textContent=String(value);
    return el;
  }
  function present(host,payload,handlers={}){
    if(!host || !payload || !Array.isArray(payload.active) ||
      !Array.isArray(payload.inactive)||!Array.isArray(payload.pending))return false;
    host.replaceChildren();
    const s=payload.summary||{};
    host.appendChild(node('p',(s.activePlayers||0)+' active players · '+(s.activeGMs||0)+' active GMs · '+(s.pending||0)+' pending · '+(s.inactive||0)+' inactive','muted'));
    if(payload.source==='legacy')host.appendChild(node('p','Legacy roster: account membership is shown using existing campaign roles. Canonical membership migration has not been activated.','muted'));
    for(const section of groups){
      const wrapper=node('section',null,'workspace-roster-group');
      wrapper.appendChild(node('h4',section.title));
      const rows=payload[section.key];
      if(!rows.length)wrapper.appendChild(node('p',section.empty,'muted'));
      for(const item of rows){
        const article=node('article',null,'workspace-roster-row');
        const heading=node('div',null,'workspace-roster-heading');
        heading.appendChild(node('b',item.displayName || item.uid));
        heading.appendChild(node('small',section.key==='pending'?'Pending GM approval':item.role+' · '+item.status));
        article.appendChild(heading);
        article.appendChild(node('small','Account: '+item.uid));
        if(section.key==='pending'){
          if(item.requestedCharacterId)article.appendChild(node('small','Character preference: '+item.requestedCharacterId+' (not linked)'));
          if(item.requestedAt)article.appendChild(node('small','Requested: '+item.requestedAt));
        }else{
          if(item.joinedAt)article.appendChild(node('small','Joined: '+item.joinedAt));
          const characters=Array.isArray(item.characters)?item.characters:[];
          article.appendChild(node('small',characters.length?'Linked characters ('+characters.length+'): '+characters.map(c=>c.name+(Number.isInteger(c.level)?' · Level '+c.level:'')).join(', '):'No verified linked characters'));
        }
        const actions=Array.isArray(item.controls)?item.controls:[];
        if(section.key!=='pending' && payload.source==='canonical' &&
          handlers.enableControls===true && typeof handlers.onAction==='function' &&
          Number.isSafeInteger(item.revision) && item.revision>0 && actions.length){
          const controls=node('div',null,'workspace-roster-controls');
          for(const action of actions){
            if(!['suspend','restore','remove','ban'].includes(action))continue;
            const button=node('button',action.charAt(0).toUpperCase()+action.slice(1));
            button.type='button';
            button.dataset.memberAction=action;
            button.dataset.memberUid=item.uid;
            button.addEventListener('click',()=>handlers.onAction({
              action,uid:item.uid,displayName:item.displayName||item.uid,
              revision:item.revision,status:item.status,role:item.role
            }));
            controls.appendChild(button);
          }
          article.appendChild(controls);
        }
        if(section.key!=='pending'&&payload.source==='canonical'&&
          handlers.enableRoleControls===true&&typeof handlers.onRoleChange==='function'&&
          item.roleEditable===true&&Number.isSafeInteger(item.revision)&&item.revision>0){
          const roleBox=node('div',null,'workspace-roster-controls');
          const roleButton=node('button',item.role==='co-gm'?'Make Player':'Make Co-GM');
          roleButton.type='button';
          roleButton.addEventListener('click',()=>handlers.onRoleChange({
            uid:item.uid,name:item.displayName||item.uid,
            newRole:item.role==='co-gm'?'player':'co-gm',
            revision:item.revision,role:item.role,status:item.status
          }));
          roleBox.appendChild(roleButton);
          if(item.role==='co-gm'&&typeof handlers.onPermissionChange==='function'){
            for(const [capability,label] of [
              ['review-join-requests','Review join requests'],
              ['moderate-members','Moderate players']
            ]){
              const current=item.capabilities?.[capability]===true;
              const button=node('button',(current?'Disable ':'Enable ')+label);
              button.type='button';
              button.addEventListener('click',()=>handlers.onPermissionChange({
                uid:item.uid,name:item.displayName||item.uid,
                capability,enabled:!current,revision:item.revision,
                role:item.role,status:item.status
              }));
              roleBox.appendChild(button);
            }
          }
          article.appendChild(roleBox);
        }
        wrapper.appendChild(article);
      }
      host.appendChild(wrapper);
    }
    if(payload.truncated)host.appendChild(node('p','More pending requests exist. Refresh the roster after reviewing the current batch.','muted'));
    return true;
  }
  if(typeof window!=='undefined')window.AsteriaCampaignRosterView=Object.freeze({present});
  if(typeof module!=='undefined'&&module.exports)module.exports={present};
})();
