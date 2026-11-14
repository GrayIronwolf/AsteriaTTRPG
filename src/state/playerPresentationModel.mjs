/** Digital GM 10.1: server-approved, membership-protected player presentation.
 * Never project arbitrary GM workspace documents or encounter internals.
 */
export const PRESENTATION_SCENES=Object.freeze([
  'blank','title','announcement','battle-map','world-map','combat','party'
]);
export const PRESENTATION_THEMES=Object.freeze(['obsidian','slate','parchment']);
export const PRESENTATION_PARTY_LIMIT=8;
export const PRESENTATION_DEFAULT=Object.freeze({
  version:1,revision:0,scene:'blank',title:'',subtitle:'',mapId:'',
  characterIds:[],showRound:false,showPartyHP:false,theme:'obsidian'
});
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export const presentationId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value);
function exactKeys(value,allowed,description){
  if(!isObject(value)||Object.keys(value).some(key=>!allowed.includes(key)))
    throw Error('Invalid '+description+' fields.');
}
function shortText(value,max,label){
  if(typeof value!=='string'||value.length>max)
    throw Error(label+' must be '+max+' characters or fewer.');
  return value.trim();
}
export function presentationDraft(input={}){
  exactKeys(input,['scene','title','subtitle','mapId','characterIds','showRound','showPartyHP','theme'],'presentation');
  if(!PRESENTATION_SCENES.includes(input.scene))throw Error('Choose a supported display scene.');
  if(!PRESENTATION_THEMES.includes(input.theme))throw Error('Choose a supported display theme.');
  if(typeof input.showRound!=='boolean'||typeof input.showPartyHP!=='boolean')
    throw Error('Invalid display visibility settings.');
  if(!Array.isArray(input.characterIds)||input.characterIds.length>PRESENTATION_PARTY_LIMIT||
    input.characterIds.some(id=>!presentationId(id))||
    new Set(input.characterIds).size!==input.characterIds.length)
    throw Error('Choose no more than eight unique campaign characters.');
  const scene=input.scene;
  const mapId=scene==='battle-map'||scene==='world-map'?input.mapId:'';
  if(mapId&&!presentationId(mapId))throw Error('Invalid published map ID.');
  if(['battle-map','world-map'].includes(scene)&&!mapId)
    throw Error('Select a published map before presenting it.');
  const title=shortText(input.title,120,'Display title');
  const subtitle=shortText(input.subtitle,380,'Display caption');
  if(['title','announcement'].includes(scene)&&!title)
    throw Error('Enter a heading for the presentation.');
  return {
    scene,title,subtitle,mapId:mapId||'',
    characterIds:scene==='party'?[...input.characterIds]:[],
    showRound:scene==='combat'&&input.showRound,
    showPartyHP:scene==='party'&&input.showPartyHP,
    theme:input.theme
  };
}
export function validatePresentationAction(action={}){
  if(!isObject(action)||!['set-scene','blackout'].includes(action.type))
    throw Error('Unsupported presentation action.');
  const allowed=action.type==='set-scene'?['type','expectedRevision','draft']:
    ['type','expectedRevision'];
  exactKeys(action,allowed,'presentation action');
  if(!Number.isSafeInteger(action.expectedRevision)||action.expectedRevision<0||action.expectedRevision>1000000)
    throw Error('Invalid presentation revision.');
  if(action.type==='set-scene')presentationDraft(action.draft);
  return action.type;
}
export function publicPresentation(draft,revision){
  const safe=presentationDraft(draft);
  if(!Number.isSafeInteger(revision)||revision<1)throw Error('Invalid published revision.');
  // A new object with an explicit allowlist: never spread raw GM workspace fields.
  return {version:1,revision,...safe};
}
export function safeCombatPresentation(encounter={},characters={}){
  if(encounter?.status!=='active')return {active:false,round:0,current:'Combat not active'};
  const round=Math.max(1,Math.min(100000,Number.isInteger(encounter.round)?encounter.round:1));
  const combatants=Array.isArray(encounter.combatants)?encounter.combatants:[];
  const index=Number.isSafeInteger(encounter.turnIndex)?encounter.turnIndex:-1;
  const actor=combatants[index]||{};
  const characterId=typeof actor.characterId==='string'?actor.characterId:'';
  // Explicitly omit all enemy/NPC names, hidden effects, stats, initiatives,
  // abilities, encounter counts and other GM data.
  const permitted=characterId&&actor.kind==='player'?characters?.[characterId]:null;
  const name=permitted&&typeof permitted.name==='string'&&permitted.name.trim()
    ?permitted.name.slice(0,90):'GM turn';
  return {active:true,round,current:name};
}
export function safePartyPresentation(characters={},ids=[],showHP=false){
  if(!Array.isArray(ids))return [];
  return ids.slice(0,PRESENTATION_PARTY_LIMIT).flatMap(id=>{
    const person=characters?.[id];
    if(!presentationId(id)||!isObject(person)||!person.id||person.id!==id)return [];
    const record={
      id,name:typeof person.name==='string'?person.name.slice(0,90):'Unnamed hero',
      className:String(person.klass||person.class||'Adventurer').slice(0,75),
      level:Number.isFinite(Number(person.level))?
        Math.max(0,Math.min(99,Math.floor(Number(person.level)))):0
    };
    if(showHP){
      const raw=person.resources?.hp;
      const value=Array.isArray(raw)?raw[0]:(isObject(raw)?raw.current:person.hp);
      const max=Array.isArray(raw)?raw[1]:(isObject(raw)?raw.max:person.hpMax);
      if(Number.isFinite(Number(value))&&Number.isFinite(Number(max))&&Number(max)>0){
        record.hp=Math.max(0,Math.floor(Number(value)));
        record.hpMax=Math.max(1,Math.floor(Number(max)));
      }
    }
    return [record];
  });
}
