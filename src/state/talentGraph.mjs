import { plainTalentText, talentKey } from './talentModel.mjs';

export const TIER_LABELS = ['I', 'II', 'III', 'IV', 'V'];
const radians = degrees => degrees * Math.PI / 180;
const polar = (origin, distance, angle) => ({x:origin.x + Math.cos(angle) * distance, y:origin.y + Math.sin(angle) * distance});

export function graphBounds(nodes, padding=0) {
  if(!nodes.length) return {x:0,y:0,width:350,height:350};
  const x=Math.min(...nodes.map(n=>n.x-n.radius))-padding, y=Math.min(...nodes.map(n=>n.y-n.radius))-padding;
  return {x,y,width:Math.max(...nodes.map(n=>n.x+n.radius))+padding-x,height:Math.max(...nodes.map(n=>n.y+n.radius))+padding-y};
}

// Layout references the canonical talents. Node IDs and rank records never become
// saved talent data; purchasing and prerequisites remain in the shared models.
export function talentGraph(catalog, compact=false) {
  const talents=[...new Map(catalog.map(t=>[t.id,t])).values()];
  const classes=[...new Set(talents.map(t=>t.className))], classNodes=[], tierNodes=[], nodes=[], rankNodes=[], edges=[];
  let offset=0;
  for(const className of classes) {
    const rows=talents.filter(t=>t.className===className), local=[];
    const maxCount=Math.max(1,...[1,2,3,4,5].map(tier=>rows.filter(t=>t.tier===tier).length));
    const branchRadius=Math.max(250,115/Math.sin(radians(110/Math.max(1,maxCount-1))));
    const orbit=Math.max(650,(branchRadius+125)/Math.sin(Math.PI/5)+20);
    const root={id:`class:${talentKey(className)}`,kind:'class',className,x:compact?175:0,y:compact?124:0,radius:compact?100:136,count:rows.length};
    local.push(root);classNodes.push(root);
    let nextY=344;
    for(let tier=1;tier<=5;tier++) {
      const angle=radians(-90+(tier-1)*72), members=rows.filter(t=>t.tier===tier);
      const hub={id:`${root.id}:tier:${tier}`,kind:'tier',className,tier,radius:compact?64:82,count:members.length,
        ...(compact?{x:175,y:nextY}:polar(root,orbit,angle))};
      tierNodes.push(hub);local.push(hub);
      edges.push({kind:'class-tier',from:root,to:hub,compact});
      const branch=[hub];
      members.forEach((talent,index)=>{
        const direction=angle+radians(members.length===1?0:-110+index*220/(members.length-1));
        const node={id:`talent:${talent.id}`,kind:'talent',className,tier,talent,radius:compact?46:54,ranks:[],
          ...(compact?{x:72,y:nextY+176+index*156}:polar(hub,branchRadius,direction))};
        nodes.push(node);local.push(node);branch.push(node);
        edges.push({kind:'tier-talent',from:hub,to:node,compact});
        for(let rank=1;rank<=talent.maxRank;rank++) {
          const point=compact
            ? [{x:168,y:-42},{x:246,y:-42},{x:306,y:0},{x:246,y:42},{x:168,y:42}][rank-1]
            : polar(node,98,direction+radians(talent.maxRank===1?0:-80+(rank-1)*160/(talent.maxRank-1)));
          const rankNode={id:`rank:${talent.id}:${rank}`,kind:'rank',className,tier,talent,rank,radius:22,
            x:point.x,y:compact?node.y+point.y:point.y};
          edges.push({kind:'rank',from:node.ranks.at(-1) || node,to:rankNode,talent});
          node.ranks.push(rankNode);rankNodes.push(rankNode);local.push(rankNode);branch.push(rankNode);
        }
      });
      hub.members=branch;
      nextY+=Math.max(230,176+members.length*156);
    }
    const bounds=graphBounds(local,32), dx=compact?0:offset-bounds.x, dy=compact?offset:32-bounds.y;
    for(const node of local) {node.x+=dx;node.y+=dy;}
    root.bounds=graphBounds(local,26);
    for(const tier of tierNodes.filter(t=>t.className===className)) tier.bounds=graphBounds(tier.members,24);
    offset=compact?root.bounds.y+root.bounds.height+120:root.bounds.x+root.bounds.width+130;
  }
  for(const node of nodes) {
    const match=plainTalentText(node.talent.prerequisite).match(/^(.+?)\s+Rank\s+(\d+|IV|III|II|I|V)$/i);
    if(!match)continue;
    const rank=Number(match[2]) || TIER_LABELS.indexOf(match[2].toUpperCase())+1;
    const source=nodes.find(n=>n.className===node.className && talentKey(n.talent.name)===talentKey(match[1]));
    const from=source?.ranks.find(n=>n.rank===rank);
    if(from)edges.push({kind:'prerequisite',from,to:node,rank});
  }
  const bounds=graphBounds([...classNodes,...tierNodes,...nodes,...rankNodes],32);
  return {classes,classNodes,tierNodes,nodes,rankNodes,edges,compact,
    tiers:TIER_LABELS.map((label,index)=>({tier:index+1,label})),
    width:compact?350:bounds.x+bounds.width,height:bounds.y+bounds.height};
}

export function fitGraphCamera(bounds, viewport, maximum=1.25) {
  const scale=Math.max(.04,Math.min(maximum,(viewport.width-32)/bounds.width,(viewport.height-32)/bounds.height));
  return {scale,x:viewport.width/2-(bounds.x+bounds.width/2)*scale,y:viewport.height/2-(bounds.y+bounds.height/2)*scale};
}

export function zoomGraphCamera(camera, scale, anchor) {
  const next=Math.min(2.5,Math.max(.04,scale)), ratio=next/camera.scale;
  return {scale:next,x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio};
}

export function graphEdgePath({from,to,kind,compact}) {
  if(compact && kind==='class-tier') return `M ${from.x} ${from.y} H 340 V ${to.y} H ${to.x}`;
  if(compact && kind==='tier-talent') return `M ${from.x} ${from.y} H 14 V ${to.y} H ${to.x}`;
  if(kind==='prerequisite') {
    const bend=Math.max(80,Math.abs(to.y-from.y)*.3);
    return `M ${from.x} ${from.y} C ${from.x-bend} ${from.y}, ${to.x-bend} ${to.y}, ${to.x-to.radius-5} ${to.y}`;
  }
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}
