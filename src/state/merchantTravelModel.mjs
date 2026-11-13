// Phase 10.2 — GM-directed, two-stop merchant routes and regional market views.
// Pure selectors and transitions: only the existing GM-only callable may save
// movement and all player transactions continue through trusted Firebase.
const text=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
const location=value=>text(value,140);
const key=value=>location(value).toLocaleLowerCase('en');
const routeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value)&&
  !['__proto__','constructor','prototype'].includes(value);
const safeList=value=>Array.isArray(value)?value:[];
const ROUTE_STATES=new Set(['Open','Unstable','Closed','Blockaded']);
export const MAX_MERCHANT_TRAVEL_HISTORY=20;

export function normalizeMerchantRoute(input={}){
  if(!routeId(input?.id))throw Error('Select a valid trade route.');
  const from=location(input.from),to=location(input.to),name=text(input.name);
  if(!from||!to||key(from)===key(to))
    throw Error('Trade routes require two different named regions.');
  const status=input.status||'Open';
  if(!ROUTE_STATES.has(status))throw Error('The trade route status is unsupported.');
  return {id:input.id,name:name||from+' – '+to,from,to,status};
}

export function merchantRouteCanDepart(route={}){
  return route?.status==='Open'||route?.status==='Unstable';
}
export function merchantTravelState(shop={}){
  return shop?.travel?.status==='travelling'?'travelling':
    shop?.travel?.status==='at-stop'?'at-stop':'stationary';
}
export function merchantShopAvailable(shop={},characterId=''){
  if(!shop||shop.status!=='open'||shop.deleted||merchantTravelState(shop)==='travelling')
    return false;
  const visitorIds=safeList(shop.visitorCharacterIds);
  return !visitorIds.length||Boolean(characterId&&visitorIds.includes(characterId));
}
export function merchantRegionOptions(shops=[]){
  const labels=new Map();
  for(const shop of safeList(shops)){
    if(!shop||shop.deleted||shop.status==='deleted')continue;
    const region=location(shop.region)||'Unassigned';
    const k=key(region);
    if(!labels.has(k))labels.set(k,region);
  }
  return [...labels.values()].sort((a,b)=>a.localeCompare(b));
}
export function merchantsInRegion(shops=[],region=''){
  const match=key(region);
  return safeList(shops).filter(shop=>
    shop&&!shop.deleted&&shop.status!=='deleted'&&
    (!match||key(location(shop.region)||'Unassigned')===match));
}

const withEvent=(shop,event,operationId='')=>({
  ...shop,
  travelHistory:[
    {...event,id:text(operationId,100)},
    ...safeList(shop.travelHistory)
  ].slice(0,MAX_MERCHANT_TRAVEL_HISTORY)
});

// All movements are explicit GM actions, never driven by a clock, route status
// polling or customer request. The current route is validated by the server
// against the campaign's existing GM Economy trade-route collection.
export function moveMerchantOnRoute(shop={},action={},route=null){
  const type=String(action.type||'');
  const travel=shop.travel&&typeof shop.travel==='object'?shop.travel:null;
  const active=merchantTravelState(shop);
  if(shop.deleted||shop.status==='deleted')throw Error('Deleted merchants cannot travel.');
  if(type==='assign-route'){
    if(active==='travelling')throw Error('Finish the current journey first.');
    const approved=normalizeMerchantRoute(route);
    const start=location(action.startRegion);
    if(![approved.from,approved.to].some(value=>key(value)===key(start)))
      throw Error('Choose the starting region from the trade route.');
    const region=key(start)===key(approved.from)?approved.from:approved.to;
    return withEvent({
      ...shop,region,
      travel:{routeId:approved.id,routeName:approved.name,
        from:approved.from,to:approved.to,status:'at-stop'}
    },{event:'assigned',routeId:approved.id,routeName:approved.name,
      from:location(shop.region),to:region},action.operationId);
  }
  if(type==='depart-route'){
    if(active!=='at-stop'||!travel?.routeId)
      throw Error('Assign a route before departing.');
    const approved=normalizeMerchantRoute(route);
    if(approved.id!==travel.routeId||
      key(approved.from)!==key(travel.from)||key(approved.to)!==key(travel.to))
      throw Error('This route changed. Reassign the merchant to the current route.');
    if(!merchantRouteCanDepart(approved))
      throw Error('This route is closed or blockaded.');
    const present=key(shop.region);
    const next=present===key(approved.from)?approved.to:
      present===key(approved.to)?approved.from:null;
    if(!next)throw Error('Merchant location no longer matches its trade route.');
    return withEvent({
      ...shop,status:'closed',
      travel:{...travel,routeName:approved.name,status:'travelling',
        departedFrom:location(shop.region),destinationRegion:next,
        resumeStatus:shop.status==='open'?'open':'closed'}
    },{event:'departed',routeId:approved.id,routeName:approved.name,
      from:location(shop.region),to:next},action.operationId);
  }
  if(type==='arrive-route'){
    if(active!=='travelling'||!travel?.destinationRegion)
      throw Error('This merchant is not travelling.');
    const dest=location(travel.destinationRegion);
    if(!dest||![travel.from,travel.to].some(value=>key(value)===key(dest)))
      throw Error('The journey destination is invalid.');
    return withEvent({
      ...shop,region:dest,
      status:travel.resumeStatus==='open'?'open':'closed',
      travel:{routeId:travel.routeId,routeName:travel.routeName,
        from:travel.from,to:travel.to,status:'at-stop'}
    },{event:'arrived',routeId:travel.routeId,routeName:travel.routeName,
      from:location(travel.departedFrom),to:dest},action.operationId);
  }
  if(type==='unassign-route'){
    if(active==='travelling')throw Error('Arrive before removing this route.');
    if(active!=='at-stop')throw Error('This merchant has no assigned route.');
    return withEvent({...shop,travel:null},{event:'unassigned',
      routeId:travel.routeId,routeName:travel.routeName,
      from:location(shop.region),to:location(shop.region)},action.operationId);
  }
  throw Error('Choose a supported merchant travel action.');
}
