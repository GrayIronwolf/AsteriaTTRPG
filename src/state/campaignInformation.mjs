const clean=(value,length=2000)=>String(value ?? '').trim().slice(0,length);
export function informationScopes(campaign={}) {
  return [
    ['Local',campaign.currentLocation || campaign.location],
    ['Settlement',campaign.currentSettlement || campaign.settlement],
    ['Region',campaign.currentRegion || campaign.region],
    ['Country',campaign.currentCountry || campaign.country],
    ['World','Asteria']
  ].filter(([,value])=>typeof value==='string' && value.trim()).map(([scope,location])=>({scope,location}));
}
export function normalizeInformation(input={},kind='news',campaign={}) {
  if(!['news','events'].includes(kind))throw new Error('Choose news or events.');
  const title=clean(input.title || input.name,160),description=clean(input.description || input.note || input.detail,12000);
  if(!title)throw new Error('Enter a title.');
  const options=informationScopes(campaign),scope=clean(input.scope || options[0]?.scope || 'World',40);
  if(!options.some(option=>option.scope===scope))throw new Error('This scope needs a campaign location first.');
  const status=clean(input.status || (kind==='events'?'Upcoming':'Published'),40);
  if(kind==='events' && !['Upcoming','Ongoing','Completed','Cancelled'].includes(status))throw new Error('Choose a valid event status.');
  return {id:clean(input.id,100),kind,title,description,scope,location:clean(input.location || options.find(option=>option.scope===scope)?.location,160),source:clean(input.source,160),start:clean(input.start,200),end:clean(input.end,200),status,published:input.published===true,worldTime:input.worldTime && typeof input.worldTime==='object'?{calendarId:clean(input.worldTime.calendarId,100),start:clean(input.worldTime.start,200),end:clean(input.worldTime.end,200)}:null};
}
// A field allowlist is essential: gmWorkspace is private and is never sent to players.
export function publicInformation(entry) {
  const {id,kind,title,description,scope,location,source,start,end,status,worldTime,updatedAt}=entry;
  return {id,kind,title,description,scope,location,source,start,end,status,worldTime,updatedAt,published:true};
}
