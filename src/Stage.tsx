import Icon from './Icons';
import {useEffect,useId,useRef,useState,type PointerEvent as RPointerEvent} from 'react';
import type {DocumentData} from './documents';
import PDFLayer from './PDFLayer';
import {clamp,copy,scaled,positions,intersection,summary,paperToImage,applyH,orderQuad,SQUARE_MM,type Axis,type Kind,type Measure,type Point,type State} from './model';

export type Tool='move'|Kind|'previous'|'current';
type Camera={zoom:number;pan:Point};
type Props={
 doc:DocumentData;
 state:State;
 tool:Tool;
 calibrating:boolean;
 calMode:'grid'|'quad';
 quad:Point[];
 onQuad:(q:Point[])=>void;
 axis:Axis;
 selected:string|null;
 formula:import('./model').Formula;
 gridVisible:boolean;
 opacity:number;
 rotation:number;
 onChange:(s:State)=>void;
 onCommit:(before:State)=>void;
 onSelect:(id:string|null)=>void;
 onNotice:(s:string)=>void;
};
type Gesture={
 type:'nav'|'grid'|'create'|'edit'|'mark'|'qtap'|'qpoint';
 index?:number;
 moved?:boolean;
 ids:number[];
 mid:Point;
 distance:number;
 camera:Camera;
 before:State;
 start:Point;
 target?:string;
 id?:string;
 draft?:Measure;
};

export default function Stage(props:Props){
 const {doc,state,tool,calibrating,calMode,quad,axis,selected,formula,gridVisible,opacity,rotation}=props;
 const quadMode=calibrating&&calMode==='quad';
 const svg=useRef<SVGSVGElement>(null),group=useRef<SVGGElement>(null),host=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState({w:390,h:844}),[camera,setCamera]=useState<Camera>({zoom:1,pan:{x:0,y:0}}),[draft,setDraft]=useState<Measure|null>(null),[lens,setLens]=useState<Point|null>(null);
 const pointers=useRef(new Map<number,Point>()),gesture=useRef<Gesture|null>(null),timer=useRef<ReturnType<typeof setTimeout>>(),longActive=useRef(false);
 const isSpacePressed=useRef(false);

 const isQuarterTurn=(rotation%180)!==0;
 const effectiveW=isQuarterTurn?doc.height:doc.width,effectiveH=isQuarterTurn?doc.width:doc.height;
 const fit=Math.min(size.w/effectiveW,size.h/effectiveH)*.96,scale=fit*camera.zoom;
 const id=useId().replace(/:/g,''),contentID='content'+id;

 useEffect(()=>{
  const el=host.current;if(!el)return;
  const ob=new ResizeObserver(e=>{
   const r=e[0].contentRect;
   setSize({w:r.width,h:r.height});
   pointers.current.clear();gesture.current=null;setDraft(null);setLens(null);
  });
  ob.observe(el);
  return()=>ob.disconnect();
 },[]);

 useEffect(()=>{
  setCamera({zoom:1,pan:{x:0,y:0}});
  pointers.current.clear();gesture.current=null;setDraft(null);
 },[doc,rotation]);

 useEffect(()=>{
  const onKeyDown=(e:KeyboardEvent)=>{
   if(e.code==='Space'&&!['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName)){
    isSpacePressed.current=true;
   }
  };
  const onKeyUp=(e:KeyboardEvent)=>{if(e.code==='Space')isSpacePressed.current=false;};
  window.addEventListener('keydown',onKeyDown);
  window.addEventListener('keyup',onKeyUp);
  return()=>{
   window.removeEventListener('keydown',onKeyDown);
   window.removeEventListener('keyup',onKeyUp);
   if(timer.current)clearTimeout(timer.current);
  };
 },[]);

 const local=(p:Point)=>{
  const m=group.current?.getScreenCTM();
  return m?new DOMPoint(p.x,p.y).matrixTransform(m.inverse()):p;
 };
 const screen=(e:{clientX:number;clientY:number}):Point=>({x:e.clientX,y:e.clientY});
 const metrics=(ids:number[])=>{
  const a=ids.map(i=>pointers.current.get(i)).filter((p):p is Point=>!!p);
  return {
   mid:a.length>1?{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}:a[0]||{x:0,y:0},
   distance:a.length>1?Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y):0
  };
 };

 function startNavigation(){
  const ids=[...pointers.current.keys()].slice(0,2),m=metrics(ids);
  gesture.current={type:calibrating&&calMode==='grid'?'grid':'nav',ids,...m,camera:copy(camera),before:copy(state),start:local(m.mid)};
 }
 function stopLens(){if(timer.current)clearTimeout(timer.current);longActive.current=false;setLens(null);}

 function down(e:RPointerEvent<SVGSVGElement>){
  if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1&&e.button!==2)return;
  e.preventDefault();
  const p=screen(e);
  pointers.current.set(e.pointerId,p);
  e.currentTarget.setPointerCapture(e.pointerId);

  // Right-click (2), middle-click (1), or space/shift held down: always pan
  const isPanButton=e.button===1||e.button===2||e.shiftKey||isSpacePressed.current;
  if(isPanButton){
   startNavigation();
   return;
  }

  if(pointers.current.size===2){
   stopLens();
   const old=gesture.current;
   if(old&&(old.type==='edit'||old.type==='mark'))props.onCommit(old.before);
   setDraft(null);
   startNavigation();
   return;
  }

  const point=local(p),target=e.target as Element;
  const handle=target.closest('[data-handle]');
  const mid=target.closest('[data-measure]')?.getAttribute('data-measure');

  if(quadMode){
   const qi=target.closest('[data-qpoint]')?.getAttribute('data-qpoint');
   if(qi!==null&&qi!==undefined){
    gesture.current={type:'qpoint',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,index:+qi};
    longActive.current=true;setLens(point);
   }else{
    gesture.current={type:'qtap',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,moved:false};
   }
  }else if(calibrating){
   startNavigation();
  }else if(handle&&mid){
   props.onSelect(mid);
   gesture.current={type:'edit',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,target:handle.getAttribute('data-handle')||'',id:mid};
  }else if((tool==='previous'||tool==='current')&&selected){
   gesture.current={type:'mark',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,id:selected,target:tool};
  }else if(mid){
   props.onSelect(mid);
   gesture.current={type:'edit',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,target:'move',id:mid};
  }else if(['PR','QRS','QT','RR'].includes(tool)){
   if(!state.calibration.confirmed){
    props.onNotice('Calibrá el tiempo antes de medir.');
    startNavigation();
    return;
   }
   const m:Measure={
    id:globalThis.crypto?.randomUUID?.()||('m-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),
    kind:tool as Kind,
    x1:point.x,
    x2:point.x,
    y:point.y,
    projection:true
   };
   gesture.current={type:'create',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,draft:m};
   setDraft(m);
  }else{
   startNavigation();
  }

  const g=gesture.current;
  if(g&&(g.type==='edit'||g.type==='mark'||g.type==='grid')){
   timer.current=setTimeout(()=>{longActive.current=true;setLens(point);},450);
  }
 }

 function edited(g:Gesture,p:Point):State{
  const next=copy(g.before),m=next.measures.find(m=>m.id===g.id);
  if(!m)return next;
  const dx=p.x-g.start.x,dy=p.y-g.start.y;
  switch(g.target){
   case 'x1':m.x1=p.x;break;
   case 'x2':m.x2=p.x;break;
   case 'move':
    m.x1+=dx;m.x2+=dx;m.y+=dy;
    if(m.tangent){m.tangent.a.x+=dx;m.tangent.b.x+=dx;m.tangent.a.y+=dy;m.tangent.b.y+=dy;m.tangent.base+=dy;}
    if(m.rrPrevious!==undefined)m.rrPrevious+=dx;
    if(m.rrCurrent!==undefined)m.rrCurrent+=dx;
    break;
   case 'label':m.y=p.y;break;
   case 'a':if(m.tangent)m.tangent.a=p;break;
   case 'b':if(m.tangent)m.tangent.b=p;break;
   case 'line':
    if(m.tangent){m.tangent.a.x+=dx;m.tangent.b.x+=dx;m.tangent.a.y+=dy;m.tangent.b.y+=dy;}
    break;
   case 'base':if(m.tangent)m.tangent.base=p.y;break;
   case 'previous':m.rrPrevious=p.x;break;
   case 'current':m.rrCurrent=p.x;break;
  }
  return next;
 }

 function move(e:RPointerEvent<SVGSVGElement>){
  if(!pointers.current.has(e.pointerId))return;
  e.preventDefault();
  const p=screen(e);
  pointers.current.set(e.pointerId,p);
  const g=gesture.current;if(!g)return;
  const point=local(p),m=metrics(g.ids);

  if(!longActive.current&&Math.hypot(p.x-g.mid.x,p.y-g.mid.y)>8&&timer.current)clearTimeout(timer.current);
  if(longActive.current)setLens(point);

  if(g.type==='qtap'&&!g.moved&&Math.hypot(p.x-g.mid.x,p.y-g.mid.y)>8)g.moved=true;

  if(g.type==='qpoint'&&g.index!==undefined){
   props.onQuad(quad.map((q,i)=>i===g.index?point:q));
  }else if(g.type==='grid'){
   const ratio=m.distance&&g.distance>3?m.distance/g.distance:1;
   const c=scaled(g.before.calibration,ratio,g.start,local(m.mid),axis);
   props.onChange({...state,calibration:c});
  }else if(g.type==='nav'||(g.type==='qtap'&&g.moved)){
   const ratio=m.distance&&g.distance>3?m.distance/g.distance:1;
   const z=clamp(g.camera.zoom*ratio,.3,100),r=z/g.camera.zoom;
   const rect=svg.current!.getBoundingClientRect();
   const center={x:rect.left+size.w/2,y:rect.top+size.h/2};
   setCamera({zoom:z,pan:{x:m.mid.x-center.x-(g.mid.x-center.x-g.camera.pan.x)*r,y:m.mid.y-center.y-(g.mid.y-center.y-g.camera.pan.y)*r}});
  }else if(g.type==='create'&&g.draft){
   g.draft={...g.draft,x2:point.x};setDraft(g.draft);
  }else if(g.type==='edit'||g.type==='mark'){
   props.onChange(edited(g,point));
  }
 }

 function up(e:RPointerEvent<SVGSVGElement>){
  if(!pointers.current.has(e.pointerId))return;
  const g=gesture.current;
  stopLens();
  if(g&&g.type==='qtap'&&!g.moved&&quad.length<4){
   props.onQuad([...quad,local(screen(e))]);
  }else if(g&&g.type==='create'&&g.draft){
   const m=g.draft;
   if(Math.abs(m.x2-m.x1)*scale>=4){
    if(m.x2<m.x1)[m.x1,m.x2]=[m.x2,m.x1];
    props.onCommit(g.before);
    props.onChange({...g.before,measures:[...g.before.measures,m]});
    props.onSelect(m.id);
   }
   setDraft(null);
  }else if(g&&g.type==='mark'){
   props.onChange(edited(g,local(screen(e))));
   props.onCommit(g.before);
  }else if(g&&g.type==='edit'){
   props.onCommit(g.before);
  }
  pointers.current.delete(e.pointerId);
  gesture.current=null;
  if(pointers.current.size){startNavigation();}
 }

 function cancelPointer(){
  stopLens();
  const g=gesture.current;
  if(g&&(g.type==='edit'||g.type==='mark'))props.onChange(g.before);
  pointers.current.clear();gesture.current=null;setDraft(null);
 }

 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{
   const tag=(e.target as HTMLElement)?.tagName;
   if(['INPUT','TEXTAREA','SELECT'].includes(tag)||calibrating||!selected||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   e.preventDefault();
   const next=copy(state),m=next.measures.find(m=>m.id===selected);
   if(!m)return;
   const dx=(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0)*state.calibration.sx*state.calibration.speed/1000*(e.shiftKey?10:1);
   const dy=(e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0)*state.calibration.sy*.1*(e.shiftKey?10:1);
   m.x1+=dx;m.x2+=dx;m.y+=dy;
   if(m.tangent){m.tangent.a.x+=dx;m.tangent.b.x+=dx;m.tangent.a.y+=dy;m.tangent.b.y+=dy;m.tangent.base+=dy;}
   if(m.rrPrevious!==undefined)m.rrPrevious+=dx;
   if(m.rrCurrent!==undefined)m.rrCurrent+=dx;
   props.onCommit(state);
   props.onChange(next);
  };
  window.addEventListener('keydown',key);
  return()=>window.removeEventListener('keydown',key);
 },[state,calibrating,selected,props.onChange,props.onCommit]);

 const color=(m:Measure)=>m.kind==='RR'?'#079eb3':m.kind==='QT'?'#9254b7':m.kind==='PR'?'#16876f':'#d27a29';
 const unit=1/Math.max(scale,.00001),stroke=1.8*unit;
 const all=draft?[...state.measures,draft]:state.measures;

 function handle(m:Measure,x:number,y:number,name:string){
  return (
   <g data-handle={name} data-measure={m.id} style={{cursor:'ew-resize'}}>
    <circle cx={x} cy={y} r={22*unit} fill="transparent"/>
    <circle cx={x} cy={y} r={5*unit} fill={color(m)} stroke="white" strokeWidth={1.5*unit}/>
   </g>
  );
 }

 const showGrid=(calibrating&&calMode==='grid')||gridVisible;
 const ordered=quad.length===4?orderQuad(quad):quad;

 return (
  <div ref={host} className="stage">
   <svg
    ref={svg}
    viewBox={`0 0 ${size.w} ${size.h}`}
    onContextMenu={e=>e.preventDefault()}
    onPointerDown={down}
    onPointerMove={move}
    onPointerUp={up}
    onPointerCancel={cancelPointer}
    onLostPointerCapture={e=>{if(pointers.current.has(e.pointerId))cancelPointer();}}
    onWheel={e=>{
     e.preventDefault();
     if(pointers.current.size)return;
     const p={x:e.clientX,y:e.clientY},r=Math.exp(clamp(-e.deltaY*.002,-2,2));
     if(calibrating&&calMode==='grid'){
      const point=local(p);
      props.onChange({...state,calibration:scaled(state.calibration,r,point,point,axis)});
     }else{
      const z=clamp(camera.zoom*r,.3,100),ratio=z/camera.zoom;
      const rect=svg.current!.getBoundingClientRect(),cx=rect.left+size.w/2,cy=rect.top+size.h/2;
      setCamera({zoom:z,pan:{x:p.x-cx-(p.x-cx-camera.pan.x)*ratio,y:p.y-cy-(p.y-cy-camera.pan.y)*ratio}});
     }
    }}
   >
    <defs>
     {[1,5,25].map(k=>{
      const c=state.calibration,w=c.sx*k,h=c.sy*k;
      return (
       <pattern key={k} id={`grid${k}${id}`} x={c.x} y={c.y} width={w} height={h} patternUnits="userSpaceOnUse">
        <path d={`${w*scale>=3?`M0 0V${h}`:''} ${h*scale>=3?`M0 0H${w}`:''}`} stroke={k===1?'#1bb9d9':k===5?'#377df0':'#e0a52e'} strokeWidth={(k===1?.5:k===5?1:1.5)*unit} fill="none"/>
       </pattern>
      );
     })}
    </defs>

    <g ref={group} transform={`translate(${size.w/2+camera.pan.x} ${size.h/2+camera.pan.y}) scale(${scale}) rotate(${rotation}) translate(${-doc.width/2} ${-doc.height/2})`}>
     <g id={contentID}>
      <rect width={doc.width} height={doc.height} fill="white"/>
      {doc.kind==='image'?<image href={doc.url} width={doc.width} height={doc.height} pointerEvents="none"/>:<PDFLayer key={`${doc.url}-${doc.page}`} doc={doc} scale={scale} onError={props.onNotice}/>}
      {showGrid&&(
       <g opacity={opacity} pointerEvents="none">
        {[1,5,25].filter(k=>state.calibration.sx*k*scale>=3||state.calibration.sy*k*scale>=3).map(k=>(
         <rect key={k} width={doc.width} height={doc.height} fill={`url(#grid${k}${id})`}/>
        ))}
       </g>
      )}

      {all.map(m=>{
       const chosen=m.id===selected&&!calibrating,end=intersection(m),x2=end??m.x2,c=color(m),left=Math.min(m.x1,x2),right=Math.max(m.x1,x2),height=55*unit;
       return (
        <g key={m.id} data-measure={m.id} opacity={calibrating?.35:1} style={{cursor:chosen?'default':'pointer'}}>
         {m.kind==='RR'&&m.projection&&(
          <path d={positions(m.x1,m.x2-m.x1,doc.width).filter(x=>Math.abs(x-m.x1)>unit&&Math.abs(x-m.x2)>unit).map(x=>`M${x} ${m.y-height}V${m.y+height}`).join(' ')} stroke={c} strokeWidth={unit} strokeDasharray={`${5*unit} ${4*unit}`} opacity=".65" fill="none" pointerEvents="none"/>
         )}
         <path d={`M${m.x1} ${m.y-height}V${m.y+height}M${x2} ${m.y-height}V${m.y+height}M${m.x1} ${m.y}H${x2}`} stroke={c} strokeWidth={stroke} fill="none" pointerEvents="none"/>
         
         {!calibrating&&(
          <>
           <path data-handle="x1" d={`M${m.x1} ${m.y-height*1.3}V${m.y+height*1.3}`} stroke="transparent" strokeWidth={32*unit} style={{cursor:'ew-resize'}}/>
           {!m.tangent&&<path data-handle="x2" d={`M${x2} ${m.y-height*1.3}V${m.y+height*1.3}`} stroke="transparent" strokeWidth={32*unit} style={{cursor:'ew-resize'}}/>}
           <path data-handle="move" d={`M${left} ${m.y}H${right}`} stroke="transparent" strokeWidth={28*unit} style={{cursor:'move'}}/>
          </>
         )}

         <text x={(m.x1+x2)/2} y={m.y-14*unit} fill={c} fontSize={12*unit} fontWeight="600" textAnchor="middle" stroke="white" strokeWidth={3.5*unit} paintOrder="stroke" data-handle="label" style={{cursor:'move',userSelect:'none'}}>
          {summary(m,state.calibration,formula)}
         </text>

         {m.kind==='QT'&&(
          <>
           {m.rrPrevious!==undefined&&(
            <g>
             <path d={`M${m.rrPrevious} ${m.y-height*1.7}V${m.y+height}`} stroke="#1199ac" strokeWidth={stroke} strokeDasharray={`${4*unit} ${3*unit}`}/>
             {chosen&&handle(m,m.rrPrevious,m.y-height*1.3,'previous')}
            </g>
           )}
           {m.rrCurrent!==undefined&&(
            <g>
             <path d={`M${m.rrCurrent} ${m.y-height*1.7}V${m.y+height}`} stroke="#1199ac" strokeWidth={stroke}/>
             {chosen&&handle(m,m.rrCurrent,m.y-height*1.3,'current')}
            </g>
           )}
           {m.rrPrevious!==undefined&&m.rrCurrent!==undefined&&(
            <path d={`M${m.rrPrevious} ${m.y-height*1.5}H${m.rrCurrent}`} stroke="#1199ac" strokeWidth={unit}/>
           )}
          </>
         )}

         {m.tangent&&(
          <>
           <path d={`M${Math.max(0,left-height)} ${m.tangent.base}H${Math.min(doc.width,right+height*2)}`} stroke="#62626a" strokeWidth={unit}/>
           {chosen&&<path data-handle="base" d={`M${left} ${m.tangent.base}H${Math.min(doc.width,right+height)}`} stroke="transparent" strokeWidth={26*unit} style={{cursor:'ns-resize'}}/>}
           {end!==null&&<path d={`M${m.tangent.b.x} ${m.tangent.b.y}L${end} ${m.tangent.base}`} stroke="#bd931f" strokeWidth={unit} strokeDasharray={`${4*unit} ${3*unit}`}/>}
           <path d={`M${m.tangent.a.x} ${m.tangent.a.y}L${m.tangent.b.x} ${m.tangent.b.y}`} stroke="#d1a126" strokeWidth={2.2*unit}/>
           {chosen&&(
            <>
             <path data-handle="line" d={`M${m.tangent.a.x} ${m.tangent.a.y}L${m.tangent.b.x} ${m.tangent.b.y}`} stroke="transparent" strokeWidth={26*unit} style={{cursor:'move'}}/>
             {handle(m,m.tangent.a.x,m.tangent.a.y,'a')}
             {handle(m,m.tangent.b.x,m.tangent.b.y,'b')}
             {handle(m,Math.min(doc.width,right+height),m.tangent.base,'base')}
            </>
           )}
           {end!==null&&<circle cx={end} cy={m.tangent.base} r={3.5*unit} fill="#b18b1d"/>}
          </>
         )}

         {chosen&&(
          <>
           {handle(m,m.x1,m.y,'x1')}
           {handle(m,m.x1,m.y-height,'x1')}
           {handle(m,m.x1,m.y+height,'x1')}
           {!m.tangent&&(
            <>
             {handle(m,x2,m.y,'x2')}
             {handle(m,x2,m.y-height,'x2')}
             {handle(m,x2,m.y+height,'x2')}
            </>
           )}
          </>
         )}
        </g>
       );
      })}

      {quadMode&&(()=>{
       const H=ordered.length===4?paperToImage(ordered,SQUARE_MM):null;
       const line=(a:Point,b:Point)=>{const p=applyH(H!,a),q=applyH(H!,b);return p&&q?`M${p.x} ${p.y}L${q.x} ${q.y}`:'';};
       const cell=Math.hypot(ordered[1]?.x-ordered[0]?.x||0,ordered[1]?.y-ordered[0]?.y||0)*scale/SQUARE_MM;
       const mm=Array.from({length:SQUARE_MM+1},(_,i)=>i);
       return (
        <g>
         {H&&cell>=5&&<path d={mm.filter(i=>i%5).map(i=>line({x:i,y:0},{x:i,y:SQUARE_MM})+line({x:0,y:i},{x:SQUARE_MM,y:i})).join('')} stroke="#1bb9d9" strokeWidth={.5*unit} opacity=".7" fill="none" pointerEvents="none"/>}
         {H&&<path d={mm.filter(i=>i%5===0).map(i=>line({x:i,y:0},{x:i,y:SQUARE_MM})+line({x:0,y:i},{x:SQUARE_MM,y:i})).join('')} stroke="#377df0" strokeWidth={unit} opacity=".9" fill="none" pointerEvents="none"/>}
         {quad.length>1&&<path d={`M${ordered.map(p=>`${p.x} ${p.y}`).join('L')}${quad.length===4?'Z':''}`} stroke="#ffcc00" strokeWidth={1.4*unit} fill="none" pointerEvents="none"/>}
         {quad.map((p,i)=>(
          <g key={i} data-qpoint={i} style={{cursor:'crosshair'}}>
           <circle cx={p.x} cy={p.y} r={24*unit} fill="transparent"/>
           <circle cx={p.x} cy={p.y} r={4*unit} fill="none" stroke="#ffcc00" strokeWidth={1.3*unit}/>
           <circle cx={p.x} cy={p.y} r={.9*unit} fill="#ffcc00"/>
           <text x={p.x+9*unit} y={p.y-9*unit} fontSize={12*unit} fontWeight="700" fill="#ffcc00" stroke="#1c1c1e" strokeWidth={3*unit} paintOrder="stroke" pointerEvents="none">{i+1}</text>
          </g>
         ))}
        </g>
       );
      })()}
     </g>
    </g>
   </svg>

   {lens&&(
    <div className="lens" aria-label="Lupa de precisión">
     <svg viewBox={`${lens.x-42*unit/2.5} ${lens.y-42*unit/2.5} ${84*unit/2.5} ${84*unit/2.5}`}>
      <use href={`#${contentID}`}/>
      <path d={`M${lens.x-12*unit} ${lens.y}H${lens.x+12*unit}M${lens.x} ${lens.y-12*unit}V${lens.y+12*unit}`} stroke="#e5aa24" strokeWidth={.6*unit}/>
     </svg>
    </div>
   )}

   {(camera.zoom!==1||camera.pan.x!==0||camera.pan.y!==0)&&(
    <button className="zoom-btn glass" aria-label="Ajustar a pantalla" title="Ajustar a pantalla" onClick={()=>setCamera({zoom:1,pan:{x:0,y:0}})}><Icon name="fit"/></button>
   )}
  </div>
 );
}
