import {test} from 'node:test';
import assert from 'node:assert/strict';
import compendium from '../data/compendium.js';
import {buildTalentCatalog} from '../src/state/talentModel.mjs';
import {fitGraphCamera,graphBounds,talentGraph,zoomGraphCamera} from '../src/state/talentGraph.mjs';

const catalog=buildTalentCatalog({classes:['Bloodhunter','Paladin']},compendium.entries);
const allNodes=g=>[...g.classNodes,...g.tierNodes,...g.nodes,...g.rankNodes];
test('bubble hierarchy retains canonical talents and every rank in single and multiclass views',()=>{
  for(const classes of [['Bloodhunter'],['Bloodhunter','Paladin'],['Fighter']]) for(const compact of [false,true]) {
    const source=buildTalentCatalog({classes},compendium.entries),before=JSON.stringify(source),g=talentGraph([...source,...source],compact);
    assert.equal(g.classNodes.length,classes.length);
    assert.equal(g.tierNodes.length,classes.length*5);
    assert.equal(g.nodes.length,source.length);
    assert.equal(g.rankNodes.length,source.reduce((n,t)=>n+t.maxRank,0));
    assert.equal(new Set(allNodes(g).map(n=>n.id)).size,allNodes(g).length);
    assert.equal(JSON.stringify(source),before);
    for(const node of g.nodes) {
      assert.equal(node.talent,source.find(t=>t.id===node.talent.id));
      const parent=g.edges.find(e=>e.kind==='tier-talent'&&e.to===node).from;
      assert.equal(parent.tier,node.talent.tier);assert.equal(parent.className,node.talent.className);
      assert.ok(g.classNodes[0].radius>parent.radius && parent.radius>node.radius && node.radius>node.ranks[0].radius);
      node.ranks.forEach((rank,index)=>assert.equal(g.edges.find(e=>e.kind==='rank'&&e.to===rank).from,index?node.ranks[index-1]:node));
    }
  }
});
test('authored prerequisites connect the required rank to its dependent talent in the same class',()=>{
  const g=talentGraph(buildTalentCatalog({classes:['Artificer','Cleric']},compendium.entries));
  assert.ok(g.edges.some(e=>e.kind==='prerequisite'));
  for(const edge of g.edges.filter(e=>e.kind==='prerequisite')) {
    assert.equal(edge.from.kind,'rank');assert.equal(edge.from.rank,edge.rank);
    assert.equal(edge.from.className,edge.to.className);
    assert.match(edge.to.talent.prerequisite,new RegExp(edge.from.talent.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});
test('dense class constellations and mobile branches keep every bubble separate and inside the canvas',()=>{
  for(const compact of [false,true]) {
    const g=talentGraph(catalog,compact),nodes=allNodes(g);
    for(const [i,a] of nodes.entries()) {
      assert.ok(a.x-a.radius>=0 && a.x+a.radius<=g.width,`${a.id} outside width`);
      assert.ok(a.y-a.radius>=0 && a.y+a.radius<=g.height,`${a.id} outside height`);
      for(const b of nodes.slice(i+1))assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+4,`${a.id} overlaps ${b.id}`);
    }
    if(compact) {assert.equal(g.width,350);assert.ok(g.classNodes[1].y>g.classNodes[0].bounds.height);}
    else assert.ok(g.classNodes[1].x>g.classNodes[0].bounds.width);
  }
});
test('camera fits a branch without clipping and zoom preserves the point under the cursor',()=>{
  const g=talentGraph(catalog),bounds=graphBounds(g.tierNodes[0].members,24);
  for(const viewport of [{width:1100,height:720},{width:350,height:600}]) {
    const camera=fitGraphCamera(bounds,viewport);
    assert.ok(bounds.x*camera.scale+camera.x>=15);
    assert.ok(bounds.y*camera.scale+camera.y>=15);
    assert.ok((bounds.x+bounds.width)*camera.scale+camera.x<=viewport.width-15);
    assert.ok((bounds.y+bounds.height)*camera.scale+camera.y<=viewport.height-15);
    const anchor={x:120,y:240},next=zoomGraphCamera(camera,camera.scale*1.5,anchor);
    for(const axis of ['x','y'])assert.ok(Math.abs((anchor[axis]-camera[axis])/camera.scale-(anchor[axis]-next[axis])/next.scale)<1e-8);
  }
});
