import {createCanvasCharacter,thinkingExpression} from './mascot-canvas.js?v=native-shape-1';
import {randomAt} from './procedural-body.js';
import {screenTiles} from './bubble-flight.js';
import {createSpawnModel,gatherAt} from './spawn-model.js';
import {sampleResetHold,sampleResetBurst,resetTiles} from './reset-model.js';
import {createWorkPresentation,exhibitionImageFrame,loadWorkFonts,selectedWorkImage,drawProjectionPrompt,projectionPromptOpacity,drawProjectionListening} from './work-presentation.js';
// Update the classic display dispatcher together with this renderer on a live edit.
import './timeline.js';

const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const tourTiles={...screenTiles,projector:[1,3]};
const GATHER_MS=950,LAUNCH_MS=GATHER_MS+350;
// Match the original body's circle radius, about 7.4% of the mascot's width.
const BODY_BUBBLE_RADIUS=.074;

export function workImageFrame(width,height,imageWidth,imageHeight){
  return exhibitionImageFrame(width,height,imageWidth,imageHeight);
}
export function workCorner(width,height,imageWidth,imageHeight,corner,frame=workImageFrame(width,height,imageWidth,imageHeight)){
  const size=Math.min(height*.24,width*.20),padding=size/2+height*.03;
  return {x:Math.max(padding,Math.min(width-padding,frame.x+(corner&1?frame.width:0)))/width,
    y:Math.max(padding,Math.min(height-padding,frame.y+(corner&2?frame.height-size/2:size/2)))/height,size};
}
function anchor(node){
  if(node.point)return node.point;
  if(node.station==='projector')return {x:.5,y:.42,size:.46};
  const image=node.project.images?.[0];
  const corner=workCorner(16/9,1,image?.width||16,image?.height||9,node.corner);
  return {...corner,size:corner.size/(16/9)};
}
function world(node){const p=anchor(node),tile=tourTiles[node.station];return {x:tile[0]+p.x,y:tile[1]+p.y};}
function tileRoute(from,to){
  const queue=[[from]],seen=new Set([from]);
  for(const route of queue){
    const id=route.at(-1);if(id===to)return route;
    for(const [key,tile] of Object.entries(tourTiles)){
      const next=key==='projector'?key:Number(key),current=tourTiles[id];
      if(next==='projector'&&from!=='projector'&&to!=='projector')continue;
      if(!seen.has(next)&&Math.abs(tile[0]-current[0])+Math.abs(tile[1]-current[1])===1){seen.add(next);queue.push([...route,next]);}
    }
  }
  throw new Error('Neznámá pozice monitoru.');
}
function flightPath(from,to){
  const points=[world(from),...tileRoute(from.station,to.station).map(id=>({x:tourTiles[id][0]+.5,y:tourTiles[id][1]+.5})),world(to)];
  const path=[{...points[0],distance:0}];
  const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  function add(point){const last=path.at(-1),length=Math.hypot(point.x-last.x,point.y-last.y);if(length>1e-8)path.push({...point,distance:last.distance+length});}
  // Round the turns inside each tile; every handoff still crosses a shared edge.
  for(let i=1;i<points.length-1;i++){
    const a=mix(points[i],points[i-1],.3),b=mix(points[i],points[i+1],.3);add(a);
    for(let j=1;j<=10;j++){const t=j/10;add(mix(mix(a,points[i],t),mix(points[i],b,t),t));}
  }
  add(points.at(-1));return path;
}
function pathPoint(path,distance){
  for(let i=1;i<path.length;i++)if(path[i].distance>=distance){
    const a=path[i-1],b=path[i],t=(distance-a.distance)/(b.distance-a.distance);
    return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:Math.atan2(b.y-a.y,b.x-a.x)};
  }
  return {...path.at(-1),heading:0};
}
export function tourFlightProgress(value){
  const t=clamp(value),s=t*t*t*(t*(t*6-15)+10);
  return s; // Gradual acceleration and braking, without a sharp burst of speed.
}
export function createWorkTour(guide){
  const assignments=guide.assignments||(guide.project?[{station:guide.station,project:guide.project}]:[]);
  const unique=new Map(assignments.filter(a=>screenTiles[a.station]&&a.project).map(a=>[Number(a.station),{...a,station:Number(a.station)}]));
  const works=[...unique.values()].sort((a,b)=>a.station-b.station);
  let seed=Number(guide.tourSession??guide.session)||1;
  for(const work of works)for(const char of String(work.project.id||work.project.title))seed=(Math.imul(seed,31)+char.charCodeAt(0))|0;
  const visits=[];
  for(let round=0;round<3;round++){
    const deck=[...works].sort((a,b)=>randomAt(a.station+round*17,seed)-randomAt(b.station+round*17,seed));
    if(round===0)deck.sort((a,b)=>Math.abs(tourTiles[a.station][0]-1)+Math.abs(tourTiles[a.station][1]-3)-Math.abs(tourTiles[b.station][0]-1)-Math.abs(tourTiles[b.station][1]-3));
    if(deck.length>1&&deck[0].station===visits.at(-1)?.station)deck.push(deck.shift());
    for(const work of deck){
      const index=visits.length;let corner=Math.floor(randomAt(index,seed^71)*4);
      if(work.station===visits.at(-1)?.station&&corner===visits.at(-1).corner)corner=(corner+1)%4;
      visits.push({...work,corner,dwell:1450+randomAt(index,seed^83)*750,blinkAt:550+randomAt(index,seed^89)*230});
    }
  }
  if(!visits.length)return null;
  if(visits.length>1&&works.length>1&&visits.at(-1).station===visits[0].station){const last=visits.length-1;[visits[last],visits[last-1]]=[visits[last-1],visits[last]];}
  if(works.length===1&&visits.at(-1).corner===visits[0].corner)
    visits.at(-1).corner=[0,1,2,3].find(corner=>corner!==visits[0].corner&&corner!==visits.at(-2).corner);
  function leg(from,to,start){
    const path=flightPath(from,to),length=path.at(-1).distance,flight=1100+length*850;
    return {from,to,path,length,flight,start,end:start+flight+to.dwell};
  }
  const initial=leg({station:'projector'},visits[0],0),legs=[];
  for(let i=0;i<visits.length;i++)legs.push(leg(visits[i],visits[(i+1)%visits.length],legs.at(-1)?.end||0));
  return {initial,legs,duration:legs.at(-1).end,launchAt:LAUNCH_MS};
}
function flightPose(leg,time,station,width,height,imageWidth,imageHeight,frame){
  const u=tourFlightProgress(time/leg.flight),point=pathPoint(leg.path,leg.length*u),tile=tourTiles[station];
  if(!tile)return null;
  let x=point.x-tile[0],y=point.y-tile[1],size=(anchor(leg.from).size+(anchor(leg.to).size-anchor(leg.from).size)*u)*width;
  // Dock at the real image corner, including letterboxing and square displays.
  // Keep this correction at zero while the body overlaps a shared screen edge.
  for(const [node,weight] of [[leg.from,1-smooth(u/.22)],[leg.to,smooth((u-.78)/.22)]]){
    if(node.point||node.station!==station||station==='projector'||!weight)continue;
    const a=anchor(node),p=workCorner(width,height,imageWidth,imageHeight,node.corner,frame),r=size/2;
    const inside=smooth((Math.min(x*width,(1-x)*width,y*height,(1-y)*height)/r-1)/.2)*weight;
    x+=(p.x-a.x)*inside;y+=(p.y-a.y)*inside;size+=(p.size-a.size*width)*inside;
  }
  return {x,y,size,u,heading:point.heading};
}
function delayedBubbles(leg,time,station,width,height,imageWidth,imageHeight,frame){
  const amount=smooth(time/300)*(1-smooth((time-leg.flight)/280));
  if(!amount)return [];
  const size=flightPose(leg,time,station,width,height,imageWidth,imageHeight,frame).size;
  return Array.from({length:7},(_,i)=>{
    const delay=75+155*randomAt(i,173),p=flightPose(leg,time-delay,station,width,height,imageWidth,imageHeight,frame);
    const angle=randomAt(i,179)*Math.PI*2,offset=p.size*.23;
    return {x:p.x+Math.cos(angle)*offset/width,y:p.y+Math.sin(angle)*offset/height,
      radius:size*BODY_BUBBLE_RADIUS*(.95+.10*randomAt(i,181))*amount};
  });
}
export function sampleWorkTour(tour,age,station,width,height,imageWidth=16,imageHeight=9,frame){
  // age is milliseconds since the shared revealAt timestamp, never a local clock.
  const center={x:.5,y:.42,size:width*.46,closed:false,blinkEnabled:false,gazeX:0,gazeY:0,rotation:0,sx:1,sy:1};
  if(age<LAUNCH_MS||!tour)return station==='projector'?{...center,phase:'gather',progress:clamp(age/GATHER_MS)}:null;
  const elapsed=age-LAUNCH_MS;
  const time=elapsed<tour.initial.end?elapsed:(elapsed-tour.initial.end)%tour.duration;
  const leg=elapsed<tour.initial.end?tour.initial:tour.legs.find(item=>time<item.end);
  const flightTime=time-leg.start;
  if(flightTime>=leg.flight){
    if(station!==leg.to.station)return null;
    const rest=flightTime-leg.flight,node=leg.to,p=workCorner(width,height,imageWidth,imageHeight,node.corner,frame);
    const next=tour.legs.find(item=>item.from===node),target=world(next.to),here=world(node),heading=Math.sign(target.x-here.x)||1;
    const look=smooth((rest-120)/240)*(1-smooth((rest-1050)/300));
    const windup=Math.sin(Math.PI*smooth((rest-(node.dwell-250))/250));
    return {...p,phase:'perch',trail:delayedBubbles(leg,flightTime,station,width,height,imageWidth,imageHeight,frame),closed:rest>=node.blinkAt&&rest<node.blinkAt+120,blinkEnabled:false,
      gazeX:(node.corner&1?-28:28)*look,gazeY:(node.corner&2?-22:22)*look,
      x:p.x-heading*.012*windup,y:p.y+.012*windup,rotation:-heading*.10*windup,sx:1+.10*windup,sy:1-.10*windup};
  }
  const body=flightPose(leg,flightTime,station,width,height,imageWidth,imageHeight,frame);if(!body)return null;
  const {x,y,size,u,heading}=body,trail=delayedBubbles(leg,flightTime,station,width,height,imageWidth,imageHeight,frame);
  const visible=(x,y,r)=>x*width+r>=0&&x*width-r<=width&&y*height+r>=0&&y*height-r<=height;
  if(!visible(x,y,size*.6)&&!trail.some(bubble=>visible(bubble.x,bubble.y,bubble.radius)))return null;
  const stretch=Math.sin(Math.PI*u);
  return {x,y,size,trail,phase:'flight',closed:false,blinkEnabled:false,gazeX:Math.cos(heading)*25,gazeY:Math.sin(heading)*20,
    rotation:Math.sin(heading)*.12*stretch,sx:1+.08*stretch,sy:1/(1+.08*stretch)};
}

export function createRecallTour(source,startedAt){
  const tour=createWorkTour(source);
  const age=Math.max(0,startedAt-(source.tourPauseMs||0)-(source.revealAt||0));
  let from={station:'projector',point:{x:.5,y:.42,size:.46}};
  for(const station of ['projector',...Object.keys(screenTiles).map(Number)]){
    const pose=sampleWorkTour(tour,age,station,1600,900);
    if(pose&&pose.x>=0&&pose.x<=1&&pose.y>=0&&pose.y<=1){
      from={station,point:{x:pose.x,y:pose.y,size:pose.size/1600}};break;
    }
  }
  const to={station:'projector'},path=flightPath(from,to),length=path.at(-1).distance;
  const flight=from.station==='projector'?0:900+Math.min(700,length*170);
  return {source,tour,returnAt:startedAt,initial:{from,to,path,length,flight,start:0,end:Infinity},legs:[],duration:Infinity};
}
export function sampleRecallTour(plan,now,station,width,height,imageWidth=16,imageHeight=9,frame){
  if(now<plan.returnAt)return sampleWorkTour(plan.tour,Math.max(0,now-(plan.source.tourPauseMs||0)-(plan.source.revealAt||0)),station,width,height,imageWidth,imageHeight,frame);
  const elapsed=now-plan.returnAt;
  if(elapsed<plan.initial.flight){
    const pose=sampleWorkTour(plan,LAUNCH_MS+elapsed,station,width,height,imageWidth,imageHeight,frame);
    // Start at the displayed image corner, including portrait images and square monitors.
    if(pose&&station===plan.initial.from.station&&elapsed<180){
      const age=Math.max(0,plan.returnAt-(plan.source.tourPauseMs||0)-(plan.source.revealAt||0));
      const origin=sampleWorkTour(plan.tour,age,station,width,height,imageWidth,imageHeight,frame);
      if(origin){
        const p=plan.initial.from.point,blend=1-smooth(elapsed/180),size=pose.size;
        const dx=(origin.x-p.x)*blend,dy=(origin.y-p.y)*blend;
        pose.x+=dx;pose.y+=dy;pose.size+=(origin.size-p.size*width)*blend;
        pose.rotation+=(origin.rotation||0)*blend;
        for(const bubble of pose.trail){bubble.x+=dx;bubble.y+=dy;bubble.radius*=pose.size/size;}
      }
    }
    return pose;
  }
  return station==='projector'?{x:.5,y:.42,size:width*.46,rotation:0,sx:1,sy:1,closed:false,blinkEnabled:true,gazeX:-15,gazeY:48}:null;
}
// Surfaces unfold away from the projection. A single circular perimeter
// reaches each monitor at its bottom edge before climbing towards its top.
export function bloomKernels(surface,aspect){
  const projector=surface==='projector';
  const row=projector?-1:[1,2,3,4].includes(surface)?0:[5,6,7].includes(surface)?1:2;
  const offset=projector?0:[1,2,5,8].includes(surface)?.7:[4,7,10].includes(surface)?-.7:0;
  const worldWidth=projector?2.95:1.9,worldHeight=worldWidth/aspect;
  const spacing=1/17,result=[];
  for(let line=-1;line<=Math.ceil(1/(spacing*aspect*.86))+1;line++){
    for(let col=-1;col<=18;col++){
      const seed=Math.sin(col*127.1+line*311.7+(Number(surface)||0)*.01)*43758.5453;
      const jitter=(Number.isFinite(seed)?seed-Math.floor(seed):.5)-.5;
      const other=Math.sin(col*269.5+line*183.3+(Number(surface)||0))*43758.5453;
      const jitterY=other-Math.floor(other)-.5;
      const x=(col+.5*(line&1))*spacing+jitter*spacing*.6;
      const y=line*spacing*aspect*.86+jitterY*spacing*aspect*.6;
      const dx=(x-.5)*worldWidth+offset;
      const dy=projector?(y-.42)*worldHeight:1.35+row*1.1+(1-y)*worldHeight;
      const distance=Math.hypot(dx,dy);
      const travel=Math.max(0,(distance-.30)/.95);
      // The circular front accelerates; later kernels are born larger.
      const arrival=(Math.sqrt(1+1.2*travel)-1)/.6+jitter*.06;
      // Sparse first pops leave room around them; the other kernels bridge gaps later.
      const bridge=jitter>-.22;
      const born=arrival+(bridge?.60+(jitterY+.5)*.35:0);
      const growth=1+Math.min(4,Math.max(0,arrival)*1.1);
      result.push({x,y,r:spacing*(.9+jitter*.2)*growth,phase:seed,rate:8+(jitterY+.5)*8,aspect,born,bridge});
    }
  }
  return result;
}
export function popcornScale(age){
  // A fast burst, a visible recoil and a smaller second bounce.
  const keys=[[0,0],[.12,1.48],[.29,.83],[.45,1.12],[.70,1]];
  if(age<=0)return 0;
  for(let i=1;i<keys.length;i++)if(age<keys[i][0]){
    const [start,a]=keys[i-1],[end,b]=keys[i];
    const t=(age-start)/(end-start),ease=t*t*(3-2*t);
    return a+(b-a)*ease;
  }
  return 1;
}
export function popcornMotion(age,phase){
  const duration=.58+.18*(.5+.5*Math.sin(phase));
  const t=Math.max(0,Math.min(1,age/duration));
  const envelope=Math.sin(t*Math.PI)*(1-t);
  const squash=.45*Math.sin(t*Math.PI*3)*envelope;
  return {pop:popcornScale(t*.7),sx:1+squash,sy:1/(1+squash),
    hop:.35*envelope};
}
// Sample from the shared time, so different frame rates keep the same tremor.
export function sampleBloomKernel(kernel,seconds){
  const p=kernel.phase;
  return {
    x:kernel.x+(Math.sin(seconds*kernel.rate+p)+.35*Math.sin(seconds*kernel.rate*1.73+p*2))*.004,
    y:kernel.y+(Math.cos(seconds*kernel.rate*.91+p)+.35*Math.sin(seconds*kernel.rate*1.47+p*3))*.004*kernel.aspect,
    r:kernel.r*(1+.045*Math.sin(seconds*kernel.rate*1.13+p))
  };
}
export function sampleBloomParticle(kernel,age,seconds,surface){
  const elapsed=age-kernel.born,motion=popcornMotion(elapsed,kernel.phase);
  const bubble=sampleBloomKernel(kernel,seconds);
  const t=Math.max(0,Math.min(1,(elapsed-.2)/.85)),merge=t*t*(3-2*t);
  const dx=kernel.x-.5,dy=(kernel.y-(surface==='projector'?.42:1.2))/kernel.aspect;
  const length=Math.hypot(dx,dy)||1;
  // A small detached kernel pops ahead of the body, then grows into the wave.
  const lead=(1-merge)*Math.min(.18,kernel.r*2.4)+kernel.r*motion.hop;
  return {...bubble,...motion,r:bubble.r*(.36+.64*merge),
    x:bubble.x+dx/length*lead,y:bubble.y+dy/length*lead*kernel.aspect};
}
const REVEAL_MS=400;
export function collapseMotion(progress){
  const p=Math.max(0,Math.min(1,progress));
  const t=p<.15?p/.15:(p-.15)/.85,ease=t*t*(3-2*t);
  const pop=p<.15?1+.12*ease:1.12*(1-ease);
  const sx=1+.25*Math.sin(p*Math.PI);
  return {pop,sx,sy:1/sx};
}
export function createGuideRenderer(character){
  const mascot=createCanvasCharacter(character),idleParticles=createSpawnModel(character),images=new Map();
  const presentation=createWorkPresentation(),fontsReady=loadWorkFonts().then(()=>presentation.clear()),views=new Map();
  let tourKey='',tour,recallKey='',recallTour;
  let burstOriginKey='',burstOrigin;
  function image(path){
    if(!images.has(path)){
      const img=new Image();img.crossOrigin='anonymous';
      const loaded=new Promise((resolve,reject)=>{img.onload=()=>resolve(path);img.onerror=()=>reject(new Error('Obrázek se nepodařilo načíst.'));});
      loaded.catch(()=>{});
      images.set(path,{img,loaded});
      img.src=new URL(path,['8765','5173'].includes(location.port)?'http://127.0.0.1:8000':location.origin).href;
      if(images.size>20){const oldest=images.keys().next().value;images.get(oldest).img.src='';images.delete(oldest);}
    }
    return images.get(path).img;
  }
  function label(ctx,text,x,y,maxWidth,size,color='#fff'){
    ctx.fillStyle=color;ctx.textAlign='center';ctx.font=`500 ${size}px system-ui,sans-serif`;
    while(ctx.measureText(text).width>maxWidth&&text.length>1)text=text.slice(0,-2)+'…';
    ctx.fillText(text,x,y);
  }
  function ready(guide,station){
    const work=guide.assignments?.find(a=>a.station===station)?.project;
    const path=work?.images?.[0]?.url;
    if(!path)return true;
    const img=image(path);return img.complete&&img.naturalWidth>0;
  }
  function prepare(guide,station){
    const path=guide.assignments?.find(a=>a.station===station)?.project?.images?.[0]?.url;
    if(!path)return Promise.resolve(null);
    image(path);return images.get(path).loaded;
  }
  function tourFor(guide){
    const assignments=guide.assignments||(guide.project?[{station:guide.station,project:guide.project}]:[]);
    const key=JSON.stringify([guide.tourSession??guide.session,assignments.map(a=>[a.station,a.project?.id||a.project?.title,a.project?.images?.[0]?.url])]);
    if(key!==tourKey){tourKey=key;tour=createWorkTour(guide);}
    return tour;
  }
  function sourcePose(guide,time,station,width,height,img){
    return sampleWorkTour(guide.phase==='presenting'?tourFor(guide):null,Math.max(0,time-(guide.revealAt||0)),station,width,height,img?.naturalWidth||16,img?.naturalHeight||9,img?.frame);
  }
  function drawTour(ctx,width,height,station,guide,now,img){
    const time=now-(guide.tourPauseMs||0);
    const pose=sourcePose(guide,time,station,width,height,img);
    paintTour(ctx,width,height,station,pose,time);
    return pose;
  }
  function drawRecall(ctx,width,height,station,guide,now){
    const {source,startedAt}=guide.recall;
    const key=JSON.stringify([guide.session,startedAt,source.assignments?.map(a=>[a.station,a.project?.id])]);
    if(key!==recallKey){recallKey=key;recallTour=createRecallTour(source,startedAt);}
    if(station==='projector')ctx.clearRect(0,0,width,height);
    else{ctx.fillStyle='#030504';ctx.fillRect(0,0,width,height);}
    const img=station==='projector'?null:paintWork(ctx,width,height,station,source);
    const pose=sampleRecallTour(recallTour,now,station,width,height,img?.naturalWidth||16,img?.naturalHeight||9,img?.frame);
    paintTour(ctx,width,height,station,pose,now);
    if(station==='projector'&&guide.phase==='listening')drawProjectionListening(ctx,width,height);
    else if(station==='projector'&&now>=recallTour.returnAt+recallTour.initial.flight)
      label(ctx,guide.message||'',width*.5,height*.89,width*.9,Math.round(height*.045),character.palette.body);
    return true;
  }
  function paintTour(ctx,width,height,station,pose,now){
    if(!pose)return;
    function body(extra={}){
      if(pose.size<=0)return;
      ctx.save();ctx.translate(pose.x*width,pose.y*height);ctx.rotate(pose.rotation);ctx.scale(pose.sx,pose.sy);
      mascot(ctx,now/1000,{...pose,...extra,x:0,y:0,rotation:0,cutoutInk:station==='projector'});ctx.restore();
    }
    if(!pose.trail?.length){body();return;}
    // Delayed circles and the body share one opaque outline, then one fill.
    // The eyes are painted just once, on the leading body.
    ctx.save();ctx.globalAlpha=1;
    const outlineRatio=character.body.outlineWidthBeforeLayerScale/character.body.circleDiameter;
    for(const outline of [true,false]){
      body({bodyPass:outline?'outline':'fill',eyesAlpha:0});
      ctx.fillStyle=outline?character.palette.outline:character.palette.body;
      for(const bubble of pose.trail){
        ctx.beginPath();ctx.arc(bubble.x*width,bubble.y*height,bubble.radius*(outline?1+outlineRatio:1),0,Math.PI*2);ctx.fill();
      }
    }
    body({bodyAlpha:0});ctx.restore();
  }
  function paintWork(ctx,width,height,station,guide,opacity=1){
    const work=guide.assignments?.find(item=>item.station===station)?.project||(station===guide.station?guide.project:null);
    if(!work)return null;
    const selection=selectedWorkImage(work,guide.imageIndices?.[station]),path=selection.images[selection.index]?.url,img=path?image(path):null;
    const view=presentation.draw(ctx,width,height,work,img,selection.images.length,opacity);
    views.set(station,{view,count:selection.images.length,session:guide.session,project:work.id});
    return {naturalWidth:img?.naturalWidth,naturalHeight:img?.naturalHeight,frame:view.image};
  }
  function resetOrigin(gesture){
    const source=gesture.source,key=JSON.stringify([gesture.frozenAt,source.session,source.assignments?.map(a=>a.station)]);
    if(key===burstOriginKey)return burstOrigin;
    burstOriginKey=key;
    for(const station of ['projector',...Object.keys(screenTiles).map(Number)]){
      const pose=sourcePose(source,gesture.frozenAt,station,1600,900);
      if(pose&&pose.x>=0&&pose.x<=1&&pose.y>=0&&pose.y<=1){
        const tile=resetTiles[station];burstOrigin={x:tile[0]+pose.x,y:tile[1]+pose.y,size:pose.size/1600,aspect:1600/900};return burstOrigin;
      }
    }
    burstOrigin={x:1.5,y:3.42,size:.46,aspect:2.95/1.6};return burstOrigin;
  }
  function drawReset(ctx,width,height,station,guide,now){
    const gesture=guide.resetGesture,source=gesture.source;
    if(station==='projector')ctx.clearRect(0,0,width,height);
    else{ctx.fillStyle='#030504';ctx.fillRect(0,0,width,height);}
    const burst=gesture.phase==='burst';
    const particles=burst?idleParticles(gesture.spawn,now):null;
    const scatter=burst?sampleResetBurst(particles,resetOrigin(gesture),gesture,now,station,width,height):null;
    const img=source.phase==='presenting'&&station!=='projector'?paintWork(ctx,width,height,station,source,scatter?.workOpacity??1):null;
    const base=sourcePose(source,gesture.frozenAt,station,width,height,img);
    if(!burst){
      paintTour(ctx,width,height,station,sampleResetHold(base,gesture,now,width,height),gesture.frozenAt);
      return true;
    }
    const origin=resetOrigin(gesture),tile=resetTiles[station];
    const pose=base||{x:origin.x-tile[0],y:origin.y-tile[1],size:origin.size*width,rotation:0,sx:1,sy:1};
    paintTour(ctx,width,height,station,{...pose,size:pose.size*scatter.bodyScale,trail:scatter.trail,
      surprise:1,closed:false,blinkEnabled:false,gazeX:0,gazeY:0},gesture.frozenAt);
    return true;
  }
  const kernelCache=new Map();
  function bloom(ctx,width,height,station,guide,now,exitProgress=0,retainBody=false){
    if(exitProgress>=1)return;
    const paint=ctx,contract=smooth(exitProgress),exit=retainBody?{pop:1-contract,sx:1,sy:1}:collapseMotion(exitProgress);
    const bodyScale=retainBody?1:exit.pop;
    const age=Math.max(0,(now-(guide.thinkingAt??now))/1000);
    const key=station+':'+width/height;
    if(!kernelCache.has(key))kernelCache.set(key,bloomKernels(station,width/height));
    const bubbles=kernelCache.get(key).map(kernel=>{
      const bubble=sampleBloomParticle(kernel,age,now/1000,station);
      return {...bubble,x:retainBody ? .5+(bubble.x-.5)*(1-contract*.85) : bubble.x,
        y:retainBody ? .42+(bubble.y-.42)*(1-contract*.85) : bubble.y,
        pop:bubble.pop*exit.pop,sx:bubble.sx*exit.sx,sy:bubble.sy*exit.sy};
    }).filter(bubble=>bubble.pop>0);
    paint.save();paint.globalAlpha=1;paint.globalCompositeOperation='source-over';
    const outlineRatio=character.body.outlineWidthBeforeLayerScale/character.body.circleDiameter;
    // The original body and new bubbles share both passes, so their borders merge.
    for(const outline of [true,false]){
      if(station==='projector')mascot(paint,now/1000,{x:width*.5,y:height*.42,size:width*.46*bodyScale,eyesAlpha:0,bodyPass:outline?'outline':'fill',cutoutInk:true});
      paint.fillStyle=outline?character.palette.outline:character.palette.body;
      for(const bubble of bubbles){
        const radius=bubble.r*width*bubble.pop*(outline?1+outlineRatio:1);
        paint.beginPath();paint.ellipse(bubble.x*width,bubble.y*height,radius*bubble.sx,radius*bubble.sy,0,0,Math.PI*2);paint.fill();
      }
    }
    // The face never travels with the expanding perimeter.
    if(station==='projector')mascot(paint,now/1000,{x:width*.5,y:height*.42,size:width*.46*bodyScale,bodyAlpha:0,...thinkingExpression(age),cutoutInk:true});
    paint.restore();
  }
  return {ready,prepare,fontsReady,audioModel:{bloomKernels,createWorkTour,sampleWorkTour,gatherAt},revealDuration:REVEAL_MS,ownsPresentation:true,imageStepAt(x,y,station,guide){
    const active=views.get(station);
    if(guide?.phase!=='presenting'||guide.resetGesture||!active||active.count<2||active.session!==guide.session)return 0;
    for(const [step,button] of [[-1,active.view.previous],[1,active.view.next]])
      if(Math.hypot(x-button.x,y-button.y)<=button.r)return step;
    return 0;
  },workWheel(x,y,delta,station,guide){
    const active=views.get(station);
    if(guide?.phase!=='presenting'||guide.resetGesture||!active||active.session!==guide.session)return 0;
    if(presentation.scroll(active.view,x,y,delta))return 0;
    return active.count>1?(delta>0?1:-1):0;
  },draw(ctx,width,height,station,guide,now,spawn){
    if(!guide||guide.phase==='idle'){
      if(station==='projector'&&!spawn?.enabled){ctx.clearRect(0,0,width,height);drawProjectionPrompt(ctx,width,height,now,projectionPromptOpacity(spawn));return true;}
      return false;
    }
    if(guide.resetGesture)return drawReset(ctx,width,height,station,guide,now);
    if(guide.recall)return drawRecall(ctx,width,height,station,guide,now);
    if(['finishing','transcribing','thinking'].includes(guide.phase)){
      if(guide.prepared)prepare(guide,station).catch(()=>{});
      if(station==='projector')ctx.clearRect(0,0,width,height);else {ctx.fillStyle='#030504';ctx.fillRect(0,0,width,height);}
      bloom(ctx,width,height,station,guide,now);return true;
    }
    if(station==='projector'){
      if(guide.phase==='presenting'){
        ctx.clearRect(0,0,width,height);
        const age=Math.max(0,now-(guide.tourPauseMs||0)-guide.revealAt);
        if(age<GATHER_MS)bloom(ctx,width,height,station,guide,now,age/GATHER_MS,true);
        else if(!drawTour(ctx,width,height,station,guide,now))drawProjectionPrompt(ctx,width,height,now,projectionPromptOpacity(spawn));
        return true;
      }
      // The spawn renderer owns the body throughout gathering and dispersal.
      if(spawn?.enabled)return false;
      if(spawn?.phase==='idle'&&['presenting','empty','error'].includes(guide.phase))return false;
      ctx.clearRect(0,0,width,height);
      mascot(ctx,now/1000,{x:width*.5,y:height*.43,size:width*.46,cutoutInk:true,closed:['finishing','thinking','transcribing'].includes(guide.phase),gazeX:-15,gazeY:48});
      if(guide.phase==='listening')drawProjectionListening(ctx,width,height);
      else label(ctx,guide.message||'',width*.5,height*.87,width*.9,Math.round(height*.045),'#cddc29');
      return true;
    }
    if(guide.phase!=='presenting')return false;
    const work=Array.isArray(guide.assignments)?guide.assignments.find(item=>item.station===station)?.project:station===guide.station?guide.project:null;
    if(!work){
      if(guide.revealAt&&now-guide.revealAt<REVEAL_MS)bloom(ctx,width,height,station,guide,now,(now-guide.revealAt)/REVEAL_MS);
      else drawTour(ctx,width,height,station,guide,now);
      return true;
    }
    ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
    const img=paintWork(ctx,width,height,station,guide);
    if(guide.revealAt&&now-guide.revealAt<REVEAL_MS)bloom(ctx,width,height,station,guide,now,(now-guide.revealAt)/REVEAL_MS);
    else drawTour(ctx,width,height,station,guide,now,img);
    return true;
  }};
}
