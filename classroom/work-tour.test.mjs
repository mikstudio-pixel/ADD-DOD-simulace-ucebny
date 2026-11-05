import test from 'node:test';
import assert from 'node:assert/strict';
import {screenTiles} from '../mascot/bubble-flight.js';
import {randomAt} from '../mascot/procedural-body.js';
import {exhibitionImageFrame} from '../mascot/work-presentation.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// The browser serves /room/ with aliases; evaluate the same source with its
// shared imports supplied explicitly, as in the bloom renderer tests.
const scope={screenTiles,randomAt,exhibitionImageFrame};
vm.runInNewContext(readFileSync(new URL('./guide-renderer.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export function','function'),scope);
const {createWorkTour,sampleWorkTour,tourFlightProgress,workCorner,workImageFrame,createRecallTour,sampleRecallTour}=scope;

const assignments=[1,3,6,8,10].map(station=>({station,project:{id:'work-'+station,images:[{url:'/media/'+station}]}}));
const guide={session:31,assignments};
const tour=createWorkTour(guide),LAUNCH=1300;
const sample=(age,station,plan=tour)=>sampleWorkTour(plan,age,station,1600,900);
const close=(a,b,tolerance=1e-5)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('the tour visits all assigned images, varies corners, and never perches on a blank monitor',()=>{
  assert.deepEqual(createWorkTour(guide),tour);
  const targets=tour.legs.map(leg=>leg.to),stations=new Set(targets.map(node=>node.station));
  assert.deepEqual([...stations].sort((a,b)=>a-b),assignments.map(a=>a.station));
  assert(new Set(targets.map(node=>node.corner)).size>=3);
  for(const leg of tour.legs)assert.notEqual(leg.from.station,leg.to.station);
  assert.notDeepEqual(createWorkTour({...guide,session:32}).legs.map(leg=>[leg.to.station,leg.to.corner]),targets.map(node=>[node.station,node.corner]));
});

test('the projection keeps its default body throughout gathering and before takeoff',()=>{
  for(const age of [0,200,600,950,1299]){
    const p=sample(age,'projector');assert.equal(p.phase,'gather');assert.equal(p.closed,false);
    close(p.x,.5);close(p.y,.42);close(p.size,1600*.46);
    assert.equal(sample(age,1),null);
  }
  const at=sample(LAUNCH,'projector'),after=sample(LAUNCH+1,'projector');
  close(at.x,.5);close(at.y,.42);close(at.size,1600*.46);
  assert(Math.hypot(at.x-after.x,at.y-after.y)<1e-6);
});

test('flights accelerate gradually, give longer routes more time, and arrive without a jump',()=>{
  assert(tourFlightProgress(.2)<.07);
  assert(tourFlightProgress(.65)-tourFlightProgress(.55)>tourFlightProgress(.2)*2.5);
  assert.equal(tourFlightProgress(0),0);assert.equal(tourFlightProgress(1),1);
  assert(tour.initial.flight>2000);
  const longer=tour.legs.find(leg=>leg.length>tour.initial.length+1);assert(longer.flight>tour.initial.flight+700);
  const landing=LAUNCH+tour.initial.flight,to=tour.initial.to.station;
  const a=sample(landing-.001,to),b=sample(landing,to);
  close(a.x,b.x);close(a.y,b.y);close(a.size,b.size,.001);
  const loop=LAUNCH+tour.initial.end+tour.duration;
  const c=sample(loop-.001,tour.legs[0].from.station),d=sample(loop,tour.legs[0].from.station);
  close(c.x,d.x);close(c.y,d.y);close(c.size,d.size,.001);
});

test('each stop looks towards the work, uses a deliberate blink, then prepares to leave',()=>{
  const node=tour.initial.to,start=LAUNCH+tour.initial.flight;
  const looking=sample(start+400,node.station),blink=sample(start+node.blinkAt+30,node.station),open=sample(start+node.blinkAt+160,node.station);
  assert(looking.gazeX*(node.corner&1?-1:1)>0);assert(looking.gazeY*(node.corner&2?-1:1)>0);
  assert.equal(blink.closed,true);assert.equal(open.closed,false);assert.equal(open.blinkEnabled,false);
  const ready=sample(start+node.dwell-125,node.station);assert.notEqual(ready.sx,1);assert.notEqual(ready.rotation,0);
  const left=sample(start+node.dwell-.001,node.station),right=sample(start+node.dwell,node.station);
  close(left.x,right.x);close(left.y,right.y);close(left.rotation,right.rotation);
});

test('docking follows actual landscape or portrait image corners on wide and square monitors',()=>{
  const node=tour.initial.to,age=LAUNCH+tour.initial.flight+100;
  for(const [w,h,iw,ih] of [[1600,900,2000,800],[1280,1024,600,1800],[900,1600,1800,600]]){
    const p=sampleWorkTour(tour,age,node.station,w,h,iw,ih),corner=workCorner(w,h,iw,ih,node.corner);
    close(p.x,corner.x);close(p.y,corner.y);close(p.size,corner.size);
    const frame=workImageFrame(w,h,iw,ih);close(frame.width/frame.height,iw/ih);
    assert(p.x*w-p.size/2>=0&&p.x*w+p.size/2<=w);assert(p.y*h-p.size/2>=0&&p.y*h+p.size/2<=h);
  }
});

test('shared-edge flights remain one synchronized body, even at different frame rates',()=>{
  const tiles={...screenTiles,projector:[1,3]},surfaces=['projector',...Object.keys(screenTiles).map(Number)];
  for(let age=LAUNCH;age<LAUNCH+tour.initial.end+tour.duration;age+=37){
    const poses=surfaces.map(station=>({station,p:sample(age,station)})).filter(({p})=>p?.phase==='flight');
    for(const {station,p} of poses){
      assert([p.x,p.y,p.size,p.rotation,p.sx,p.sy].every(Number.isFinite));
      assert.deepEqual(sample(age,station),p);
      const tile=tiles[station];
      // All surfaces use the same global point while the body crosses an edge.
      if(p.x<0||p.x>1||p.y<0||p.y>1){
        for(const other of poses){
          const otherTile=tiles[other.station];
          if(Math.abs(otherTile[0]-tile[0])+Math.abs(otherTile[1]-tile[1])!==1)continue;
          close(p.x+tile[0],other.p.x+otherTile[0]);close(p.y+tile[1],other.p.y+otherTile[1]);
        }
      }
    }
    assert(surfaces.some(station=>sample(age,station)),`mascot vanished at ${age}`);
  }
});

test('one image still gets different corners, while an empty result leaves the mascot on the projection',()=>{
  const single=createWorkTour({session:1,assignments:assignments.slice(0,1)});
  for(const leg of single.legs){assert.equal(leg.from.station,1);assert.equal(leg.to.station,1);assert.notEqual(leg.from.corner,leg.to.corner);}
  assert.equal(createWorkTour({assignments:[]}),null);
  assert.equal(sampleWorkTour(null,10000,'projector',1600,900).phase,'gather');
  assert.equal(sampleWorkTour(null,10000,1,1600,900),null);
});
test('individual delayed circles trail the flight and settle back into the body after landing',()=>{
  const surfaces=['projector',...Object.keys(screenTiles).map(Number)],age=LAUNCH+tour.initial.flight*.5;
  const p=surfaces.map(station=>sample(age,station)).find(p=>p&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
  assert.equal(p.trail.length,7);assert(new Set(p.trail.map(b=>b.radius)).size>3);
  const lag=p.trail.reduce((sum,b)=>sum+(p.x-b.x)*p.gazeX/25+(p.y-b.y)*p.gazeY/20,0)/p.trail.length;
  assert(lag>.01);assert(p.trail.every(b=>b.radius>0&&!('alpha' in b)));
  assert(p.trail.every(b=>b.radius<p.size*.09),'trailing circles stay within the scale of the original body circles');
  const landing=LAUNCH+tour.initial.flight,station=tour.initial.to.station;
  assert(sample(landing+100,station).trail.length>0);assert.equal(sample(landing+300,station).trail.length,0);
});
test('after the first departure the mascot never takes a shortcut through the projection',()=>{
  for(let age=LAUNCH+tour.initial.end;age<LAUNCH+tour.initial.end+tour.duration;age+=101)
    assert.equal(sample(age,'projector'),null);
});
test('a recording immediately recalls one mascot along shared edges, then leaves it on the projection',()=>{
  const startedAt=20000,age=LAUNCH+tour.initial.flight+400,tourPauseMs=275;
  const source={...guide,phase:'presenting',revealAt:startedAt-age-tourPauseMs,tourPauseMs};
  const plan=createRecallTour(source,startedAt);
  const surfaces=['projector',...Object.keys(screenTiles).map(Number)];
  assert.equal(plan.returnAt,startedAt);assert.equal(plan.initial.from.station,tour.initial.to.station);
  for(const station of surfaces)
    assert.deepEqual(sampleRecallTour(plan,startedAt-1,station,1600,900),sampleWorkTour(tour,age-1,station,1600,900));
  const from=plan.initial.from.station,a=sampleRecallTour(plan,startedAt-.001,from,1600,900),b=sampleRecallTour(plan,startedAt,from,1600,900);
  assert.equal(a.phase,'perch');assert.equal(b.phase,'flight');
  close(a.x,b.x);close(a.y,b.y);close(a.size,b.size,.001);
  const landed=startedAt+plan.initial.flight;
  for(let now=startedAt+1;now<landed;now+=29){
    const poses=surfaces.map(station=>({station,p:sampleRecallTour(plan,now,station,1600,900)})).filter(({p})=>p);
    const centres=poses.filter(({p})=>p.x>=0&&p.x<1&&p.y>=0&&p.y<1);
    assert.equal(centres.length,1,`one mascot at ${now}`);
    assert(poses.every(({p})=>Number.isFinite(p.size)&&p.trail.every(b=>b.radius<p.size*.09)));
  }
  for(const station of surfaces){
    const pose=sampleRecallTour(plan,landed,station,1600,900);
    if(station==='projector'){close(pose.x,.5);close(pose.y,.42);close(pose.size,736);assert.equal(pose.gazeY,48);}
    else assert.equal(pose,null);
  }
});
test('cancelling a short recording retains the exact previous tour',()=>{
  assert.deepEqual(createWorkTour({...guide,session:guide.session+10,tourSession:guide.session}),tour);
});
test('recall starts at the currently displayed corner for portrait works and different monitor shapes',()=>{
  const startedAt=20000,age=LAUNCH+tour.initial.flight+400,source={...guide,phase:'presenting',revealAt:startedAt-age};
  const plan=createRecallTour(source,startedAt),station=tour.initial.to.station;
  for(const [width,height,iw,ih] of [[1600,900,600,1800],[1280,1024,600,1800],[900,1600,1800,600]]){
    const a=sampleRecallTour(plan,startedAt-.001,station,width,height,iw,ih),b=sampleRecallTour(plan,startedAt,station,width,height,iw,ih);
    close(a.x,b.x);close(a.y,b.y);close(a.size,b.size,.001);close(a.rotation,b.rotation,.001);
  }
});
