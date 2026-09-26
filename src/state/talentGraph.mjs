import { talentKey } from './talentModel.mjs';

// The graph only places canonical records; purchasing still uses talentModel.
export function talentGraph(catalog, compact=false) {
  const classes=[...new Set(catalog.map(t=>t.className))], lane=350, nodes=[], tiers=[], headings=[], edges=[];
  let y=24;
  for(let tier=1;tier<=5;tier++) {
    tiers.push({tier,y});y+=48;
    let end=y+70;
    for(const [column,className] of classes.entries()) {
      const x=compact?0:column*lane;
      headings.push({className,tier,x,y});
      const rows=catalog.filter(t=>t.className===className && t.tier===tier);
      rows.forEach((talent,i)=>nodes.push({talent,x:x+14,y:y+36+i*132,width:322,height:110}));
      const bottom=y+Math.max(1,rows.length)*132+44;
      end=Math.max(end,bottom);
      if(compact)y=bottom;
    }
    y=end+24;
  }
  for(const node of nodes) {
    const match=String(node.talent.prerequisite || '').replace(/\*|`/g,'').match(/^(.+?)\s+Rank\s+(\d+|IV|III|II|I|V)$/i);
    if(!match)continue;
    const from=nodes.find(n=>n.talent.className===node.talent.className && talentKey(n.talent.name)===talentKey(match[1]));
    if(from)edges.push({from,to:node,rank:match[2]});
  }
  return {classes,nodes,tiers,headings,edges,width:Math.max(lane,compact?lane:classes.length*lane),height:y};
}
