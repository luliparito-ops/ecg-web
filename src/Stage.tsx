import {useEffect,useId,useRef,useState,type MutableRefObject,type PointerEvent as RPointerEvent,type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import type {DocumentData} from './documents';
import PDFLayer from './PDFLayer';
import {clamp,copy,scaled,positions,intersection,readout,qtStage,translate,setEdge,paperToImage,applyH,orderQuad,SQUARE_MM,type Axis,type Formula,type Kind,type Measure,type Point,type State} from './model';

export type Tool='move'|Kind|'previous'|'current';

/** Un tono por tipo de medida: sobrios, con contraste ≥ 4,5:1 sobre papel blanco (≥ 3,4:1 sobre la grilla rosada). */
export const KIND_COLOR:Record<Kind,string>={PR:'#1E7F45',QRS:'#B93C0A',QT:'#7B3AB0',RR:'#0A64A8'};
/** El QT se tiñe según cuánto falta para su QTc: sin R (ámbar), una R (violeta medio), las dos R (violeta pleno). */
export const QT_STAGE_COLOR=['#A65F00','#9059C9','#6B2FA0'];
export const measureColor=(m:Measure,c:State['calibration']):string=>m.kind==='QT'?QT_STAGE_COLOR[qtStage(m,c)]:KIND_COLOR[m.kind];

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
 formula:Formula;
 gridVisible:boolean;
 opacity:number;
 rotation:number;
 onChange:(s:State)=>void;
 onCommit:(before:State)=>void;
 onSelect:(id:string|null,keepTool?:boolean)=>void;
 onNotice:(s:string)=>void;
 onMarked?:()=>void;
 fitKey?:number;
 exportRef?:MutableRefObject<(()=>Promise<Blob>)|null>;
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
 ext?:boolean;
 anchor?:Point;
};

/* Medidas en píxeles de pantalla (independientes del zoom). */
const JAW=34;          // media altura de las mordazas sin extender
const HIT=44;          // objetivo táctil mínimo (HIG)
const KNOB=4.5;        // radio visible de una manija
const PILL_H=22,PILL_PAD=9,PILL_FONT=12.5;
/* Las lecturas usan una tipografía de instrumento (monoespaciada), distinta de la de la interfaz. */
const FONT='ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';
const HALO='rgba(255,255,255,.82)',INK='#3A3A3C',GRID_FINE='#0A84FF',GRID_BOLD='#FF9F0A',QUAD='#FFC300';

let measureCtx:CanvasRenderingContext2D|null|undefined;
const widthCache=new Map<string,number>();
/** Ancho de texto en px de pantalla para dimensionar las píldoras. */
function textWidth(text:string,weight=500,size=PILL_FONT){
 const key=`${weight}|${size}|${text}`;
 let w=widthCache.get(key);
 if(w===undefined){
  if(measureCtx===undefined)measureCtx=document.createElement('canvas').getContext('2d');
  if(measureCtx){measureCtx.font=`${weight} ${size}px ${FONT}`;w=measureCtx.measureText(text).width;}
  else w=text.length*size*.6;
  if(widthCache.size>400)widthCache.clear();
  widthCache.set(key,w);
 }
 return w;
}

export default function Stage(props:Props){
 const {doc,state,tool,calibrating,calMode,quad,axis,formula,gridVisible,opacity,rotation}=props;
 const quadMode=calibrating&&calMode==='quad';
 const [forced,setForced]=useState<number|null>(null);
 // Al exportar se dibuja sin selección ni bloqueos.
 const selected=forced===null?props.selected:null;
 const svg=useRef<SVGSVGElement>(null),group=useRef<SVGGElement>(null),host=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState({w:390,h:844}),[camera,setCamera]=useState<Camera>({zoom:1,pan:{x:0,y:0}}),[draft,setDraft]=useState<Measure|null>(null),[lens,setLens]=useState<Point|null>(null);
 const [dpr,setDpr]=useState(()=>typeof window==='undefined'?2:window.devicePixelRatio||1);
 const [active,setActive]=useState<{id:string;target:string}|null>(null);
 const [settle,setSettle]=useState<{id:string;target:string;key:number}|null>(null);
 const pointers=useRef(new Map<number,Point>()),gesture=useRef<Gesture|null>(null),timer=useRef<ReturnType<typeof setTimeout>>(),longActive=useRef(false);
 const isSpacePressed=useRef(false),rrHint=useRef(false),grab=useRef<{id:string;side:1|2}|null>(null);

 const isQuarterTurn=(rotation%180)!==0;
 const effectiveW=isQuarterTurn?doc.height:doc.width,effectiveH=isQuarterTurn?doc.width:doc.height;
 const fit=Math.min(size.w/effectiveW,size.h/effectiveH)*.96,scale=forced??fit*camera.zoom;
 const id=useId().replace(/:/g,''),contentID='content'+id;

 useEffect(()=>{
  const el=host.current;if(!el)return;
  const ob=new ResizeObserver(e=>{
   const r=e[0].contentRect;
   setSize({w:r.width,h:r.height});
   setDpr(window.devicePixelRatio||1);
   pointers.current.clear();gesture.current=null;setDraft(null);setLens(null);setActive(null);
  });
  ob.observe(el);
  return()=>ob.disconnect();
 },[]);

 useEffect(()=>{
  setCamera({zoom:1,pan:{x:0,y:0}});
  pointers.current.clear();gesture.current=null;setDraft(null);
 },[doc,rotation]);

 useEffect(()=>{if(props.fitKey)setCamera({zoom:1,pan:{x:0,y:0}});},[props.fitKey]);

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

 useEffect(()=>{
  if(!settle)return;
  const t=setTimeout(()=>setSettle(null),450);
  return()=>clearTimeout(t);
 },[settle]);

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

 /** Punto de pantalla donde se cruzan la barra horizontal y la mordaza del lado agarrado de la medida elegida: el zoom parte de ahí. */
 function anchorFor(mid:Point):Point|null{
  if(calibrating||!props.selected)return null;
  const m=state.measures.find(x=>x.id===props.selected),ctm=group.current?.getScreenCTM();
  if(!m||!ctm)return null;
  const xb=intersection(m)??m.x2,g=grab.current;
  let side:1|2;
  if(g&&g.id===m.id)side=g.side;
  else{const p=local(mid);side=Math.abs(p.x-m.x1)<=Math.abs(p.x-xb)?1:2;}
  const q=new DOMPoint(side===1?m.x1:xb,m.y).matrixTransform(ctm);
  return {x:q.x,y:q.y};
 }
 function startNavigation(){
  const ids=[...pointers.current.keys()].slice(0,2),m=metrics(ids),isGrid=calibrating&&calMode==='grid';
  gesture.current={type:isGrid?'grid':'nav',ids,...m,camera:copy(camera),before:copy(state),start:local(m.mid),anchor:isGrid?undefined:anchorFor(m.mid)??undefined};
 }
 function stopLens(){if(timer.current)clearTimeout(timer.current);longActive.current=false;setLens(null);}

 function down(e:RPointerEvent<SVGSVGElement>){
  if(e.pointerType==='mouse'&&e.button!==0&&e.button!==1&&e.button!==2)return;
  e.preventDefault();
  const p=screen(e);
  pointers.current.set(e.pointerId,p);
  e.currentTarget.setPointerCapture(e.pointerId);

  // Botón derecho o central, o Mayúsculas/espacio: siempre desplaza.
  const isPanButton=e.button===1||e.button===2||e.shiftKey||isSpacePressed.current;
  if(isPanButton){
   startNavigation();
   return;
  }

  if(pointers.current.size===2){
   stopLens();
   const old=gesture.current;
   if(old&&(old.type==='edit'||old.type==='mark'))props.onCommit(old.before);
   setDraft(null);setActive(null);
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
  }else if((tool==='previous'||tool==='current')&&selected){
   // Marcar una R tiene prioridad: la R actual cae dentro del propio calibre.
   gesture.current={type:'mark',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,id:selected,target:tool};
  }else if(handle&&mid){
   props.onSelect(mid);
   const t=handle.getAttribute('data-handle')||'move';
   grab.current=/^x([12])/.test(t)?{id:mid,side:t[1]==='1'?1:2}:null;
   gesture.current={type:'edit',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,target:t,id:mid};
   setActive({id:mid,target:t});
  }else if(mid){
   props.onSelect(mid);
   grab.current=null;
   gesture.current={type:'edit',ids:[e.pointerId],mid:p,distance:0,camera:copy(camera),before:copy(state),start:point,target:'move',id:mid};
   setActive({id:mid,target:'move'});
  }else if(['PR','QRS','QT','RR'].includes(tool)){
   if(!state.calibration.confirmed){
    props.onNotice('Calibrá antes de medir.');
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

 /** Edición relativa: la manija conserva la distancia al dedo (sin saltos al tomarla por el borde de su zona táctil). */
 function edited(g:Gesture,p:Point,sp:Point):State{
  const next=copy(g.before),m=next.measures.find(m=>m.id===g.id),b=g.before.measures.find(m=>m.id===g.id);
  if(!m||!b)return next;
  const dx=p.x-g.start.x,dy=p.y-g.start.y,u=1/Math.max(scale,1e-5);
  if(g.type==='mark'){
   if(g.target==='previous')m.rrPrevious=p.x;else m.rrCurrent=p.x;
   return next;
  }
  const end=/^x([12])([tb])$/.exec(g.target||'');
  if(end){
   // Desde un extremo la línea se mueve en horizontal; un gesto vertical claro pasa al modo de extensión.
   if(!g.ext&&Math.abs(dy*scale)>26&&Math.abs(dy)>2*Math.abs(dx))g.ext=true;
   if(g.ext){
    if(end[2]==='t')setEdge(m,'top',(b.top??b.y-JAW*u)+dy,4*u);else setEdge(m,'bottom',(b.bottom??b.y+JAW*u)+dy,4*u);
   }else if(end[1]==='1')m.x1=b.x1+dx;else m.x2=b.x2+dx;
   return next;
  }
  switch(g.target){
   case 'x1':m.x1=b.x1+dx;break;
   case 'x2':m.x2=b.x2+dx;break;
   case 'move':case 'label':translate(m,dx,dy);break;
   case 'top':setEdge(m,'top',(b.top??b.y-JAW*u)+dy,4*u);break;
   case 'bottom':setEdge(m,'bottom',(b.bottom??b.y+JAW*u)+dy,4*u);break;
   case 'a':if(m.tangent&&b.tangent)m.tangent.a={x:b.tangent.a.x+dx,y:b.tangent.a.y+dy};break;
   case 'b':if(m.tangent&&b.tangent)m.tangent.b={x:b.tangent.b.x+dx,y:b.tangent.b.y+dy};break;
   case 'line':
    if(m.tangent){m.tangent.a.x+=dx;m.tangent.b.x+=dx;m.tangent.a.y+=dy;m.tangent.b.y+=dy;}
    break;
   case 'base':if(m.tangent&&b.tangent)m.tangent.base=b.tangent.base+dy;break;
   case 'previous':if(b.rrPrevious!==undefined)m.rrPrevious=b.rrPrevious+dx;break;
   case 'current':if(b.rrCurrent!==undefined)m.rrCurrent=b.rrCurrent+dx;break;
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
   const a=g.anchor,o=a??g.mid,t=a?{x:a.x+m.mid.x-g.mid.x,y:a.y+m.mid.y-g.mid.y}:m.mid;
   setCamera({zoom:z,pan:{x:t.x-center.x-(o.x-center.x-g.camera.pan.x)*r,y:t.y-center.y-(o.y-center.y-g.camera.pan.y)*r}});
  }else if(g.type==='create'&&g.draft){
   g.draft={...g.draft,x2:point.x};setDraft(g.draft);
  }else if(g.type==='edit'||g.type==='mark'){
   props.onChange(edited(g,point,p));
  }
 }

 /** Medida bajo un punto (documento): las bloqueadas no reciben eventos, así que un toque corto las localiza por geometría. */
 function hitMeasure(pt:Point):string|null{
  const u=1/Math.max(scale,1e-5),tol=14*u;
  for(let i=state.measures.length-1;i>=0;i--){
   const m=state.measures[i],xb=intersection(m)??m.x2,lo=Math.min(m.x1,xb),hi=Math.max(m.x1,xb);
   const t=m.top??m.y-JAW*u,b=m.bottom??m.y+JAW*u;
   if(pt.x>=lo-tol&&pt.x<=hi+tol&&pt.y>=t-tol&&pt.y<=b+tol)return m.id;
  }
  return null;
 }
 function tapSelect(pt:Point){
  // Con una medida en foco las demás están bloqueadas: se cambia de medida con Listo o desde la lista.
  if(selected)return;
  const id=hitMeasure(pt);
  if(id)props.onSelect(id);
 }

 function up(e:RPointerEvent<SVGSVGElement>){
  if(!pointers.current.has(e.pointerId))return;
  const g=gesture.current;
  stopLens();
  setActive(null);
  if(g&&g.type==='qtap'&&!g.moved&&quad.length<4){
   props.onQuad([...quad,local(screen(e))]);
  }else if(g&&g.type==='create'&&g.draft){
   const m=g.draft;
   if(Math.abs(m.x2-m.x1)*scale>=4){
    if(m.x2<m.x1)[m.x1,m.x2]=[m.x2,m.x1];
    props.onCommit(g.before);
    props.onChange({...g.before,measures:[...g.before.measures,m]});
    props.onSelect(m.id,true);
    setSettle({id:m.id,target:'x2',key:Date.now()});
    if(!rrHint.current){rrHint.current=true;props.onNotice('Tirá hacia arriba o abajo desde un extremo para extender el calibre');}
   }else tapSelect(local(screen(e)));
   setDraft(null);
  }else if(g&&g.type==='nav'&&g.ids.length===1&&!calibrating&&Math.hypot(e.clientX-g.mid.x,e.clientY-g.mid.y)<6){
   tapSelect(local(screen(e)));
  }else if(g&&g.type==='mark'){
   props.onChange(edited(g,local(screen(e)),screen(e)));
   props.onCommit(g.before);
   if(g.id)setSettle({id:g.id,target:g.target||'',key:Date.now()});
   props.onMarked?.();
  }else if(g&&g.type==='edit'){
   props.onCommit(g.before);
   if(g.id&&g.target&&g.target!=='move')setSettle({id:g.id,target:g.target,key:Date.now()});
  }
  pointers.current.delete(e.pointerId);
  gesture.current=null;
  if(pointers.current.size){startNavigation();}
 }

 function cancelPointer(){
  stopLens();setActive(null);
  const g=gesture.current;
  if(g&&(g.type==='edit'||g.type==='mark'))props.onChange(g.before);
  pointers.current.clear();gesture.current=null;setDraft(null);
 }

 useEffect(()=>{
  const key=(e:KeyboardEvent)=>{
   const tag=(e.target as HTMLElement)?.tagName;
   if(['INPUT','TEXTAREA','SELECT'].includes(tag)||calibrating||!selected||tool!=='move'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
   e.preventDefault();
   const next=copy(state),m=next.measures.find(m=>m.id===selected);
   if(!m)return;
   const dx=(e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0)*state.calibration.sx*state.calibration.speed/1000*(e.shiftKey?10:1);
   const dy=(e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0)*state.calibration.sy*.1*(e.shiftKey?10:1);
   translate(m,dx,dy);
   props.onCommit(state);
   props.onChange(next);
  };
  window.addEventListener('keydown',key);
  return()=>window.removeEventListener('keydown',key);
 },[state,calibrating,selected,props.onChange,props.onCommit]);

 /* ---------- Geometría de pantalla ---------- */
 const markMode=forced===null&&(tool==='previous'||tool==='current');
 const creatingKind=forced===null&&['PR','QRS','QT','RR'].includes(tool);
 const unit=1/Math.max(scale,.00001);
 // Trazo principal: 2 px físicos en pantallas retina (1 px en las de densidad 1). Auxiliar: 1 px físico.
 const MAIN=Math.max(1,Math.round(dpr*.75))/dpr,HAIR=1/dpr;
 const rot=((rotation%360)+360)%360,horizontal=rot===0||rot===180;
 /** Ajusta una coordenada del documento para que una línea de `w` px caiga justo sobre los píxeles físicos. Solo afecta al dibujo. */
 const snapper=(which:'x'|'y')=>{
  const onX=which==='x'?horizontal:!horizontal;
  const T=onX?size.w/2+camera.pan.x:size.h/2+camera.pan.y;
  const sign=which==='x'?(rot===0||rot===90?1:-1):(rot===0||rot===270?1:-1);
  const C=which==='x'?doc.width/2:doc.height/2,k=sign*scale;
  return (v:number,w:number)=>{
   if(!Number.isFinite(v)||!k)return v;
   const s=T+k*(v-C),pw=Math.max(1,Math.round(w*dpr)),off=pw%2?.5:0;
   return C+((Math.round(s*dpr-off)+off)/dpr-T)/k;
  };
 };
 const sx=snapper('x'),sy=snapper('y');
 const all=draft?[...state.measures,draft]:state.measures;

 const knob=(m:Measure,x:number,y:number,name:string,c:string)=>{
  const on=active?.id===m.id&&active.target===name;
  return (
   <g key={name+x+y} pointerEvents="none">
    <circle cx={x} cy={y} r={(on?KNOB+1.5:KNOB)*unit} fill="#fff" stroke={c} strokeWidth={(on?MAIN*1.5:MAIN)*unit} style={{transition:'r .12s'}}/>
    {settle&&settle.id===m.id&&settle.target===name&&(
     <circle key={settle.key} className="settle" cx={x} cy={y} r={11*unit} fill="none" stroke={c} strokeWidth={MAIN*unit}/>
    )}
   </g>
  );
 };
 const hitCircle=(m:Measure,x:number,y:number,name:string,cursor:string)=>(
  <circle key={'h'+name} data-handle={name} data-measure={m.id} cx={x} cy={y} r={HIT/2*unit} fill="transparent" style={{cursor}}/>
 );
 const pill=(cx:number,cy:number,text:string,c:string,lead:string|null,handle:string|null,m:Measure,anchor:'middle'|'start'='middle')=>{
  const full=(lead?lead+' ':'')+text;
  const w=Math.ceil(textWidth(full))+PILL_PAD*2,h=PILL_H;
  const x=anchor==='middle'?cx-w/2*unit:cx;
  return (
   <g data-handle={handle??undefined} data-measure={handle?m.id:undefined} style={{cursor:handle?'grab':undefined}} pointerEvents={handle?undefined:'none'}>
    <rect x={x} y={cy-h/2*unit} width={w*unit} height={h*unit} rx={h/2*unit} fill={c} stroke={HALO} strokeWidth={unit}/>
    <text x={x+w/2*unit} y={cy} dy=".36em" textAnchor="middle" fontSize={PILL_FONT*unit} fontWeight={500} fontFamily={FONT} fill="#fff" style={{fontVariantNumeric:'tabular-nums',userSelect:'none'}}>
     {lead&&<tspan fillOpacity={.78}>{lead} </tspan>}{text}
    </text>
   </g>
  );
 };

 function renderMeasure(m:Measure,isDraft:boolean){
  const chosen=m.id===selected&&!calibrating&&!isDraft,c=measureColor(m,state.calibration),end=intersection(m),xb=end??m.x2,xa=m.x1;
  const H=JAW*unit,left=Math.min(xa,xb),right=Math.max(xa,xb),gap=(right-left)*scale;
  const rr=m.kind==='RR',topY=m.top!==undefined?m.top:m.y-H,botY=m.bottom!==undefined?m.bottom:m.y+H;
  const X1=sx(xa,MAIN),X2=sx(xb,MAIN),Y=sy(m.y,MAIN),T=sy(topY,MAIN),B=sy(botY,MAIN),ext=6*unit;
  const r=readout(m,state.calibration,formula);
  // En el lienzo solo el valor principal: QTc, lpm y mm quedan en el panel para no tapar el trazado.
  // En QT la píldora muestra el QTc en cuanto se puede calcular.
  const useQtc=m.kind==='QT'&&r.qtc!==null,value=useQtc?`${r.qtc} ms`:r.value===null?'—':`${r.value} ms`;
  let d=`M${X1} ${T}V${B}M${X2} ${T}V${B}M${X1} ${Y}H${X2}`;
  if(m.top!==undefined)d+=`M${Math.min(X1,X2)-ext} ${T}H${Math.max(X1,X2)+ext}`;
  if(m.bottom!==undefined)d+=`M${Math.min(X1,X2)-ext} ${B}H${Math.max(X1,X2)+ext}`;
  // Con una medida elegida, las demás quedan bloqueadas: ni se tocan ni se arrastran.
  const dim=(!!selected||creatingKind)&&!chosen&&!isDraft&&!calibrating;
  const mx=(xa+xb)/2,dir=xb>=xa?1:-1,inner=Math.min(14,gap*.3)*unit,outer=(HIT-14)*unit;
  const jawRect=(x:number,s:number,name:string)=>{
   const a=x-s*outer,b=x+s*inner;
   return <rect key={name} data-handle={name} data-measure={m.id} x={Math.min(a,b)} y={Math.min(T,B)-10*unit} width={Math.abs(b-a)} height={Math.abs(B-T)+20*unit} fill="transparent" style={{cursor:'ew-resize'}}/>;
  };
  // Referencias R por debajo de la barra: la píldora del valor ocupa la zona superior.
  const rBot=m.y+H*1.45,rKnob=m.y+H*1.2,rLabel=(x:number,t:string)=>(
   <text x={x} y={rBot+12*unit} textAnchor="middle" fontSize={10.5*unit} fontWeight={500} fontFamily={FONT} fill={c} stroke={HALO} strokeWidth={3*unit} paintOrder="stroke" pointerEvents="none" style={{userSelect:'none'}}>{t}</text>
  );
  const parts:ReactNode[]=[];

  if(rr&&m.projection){
   const p=positions(xa,xb-xa,doc.width).filter(x=>Math.abs(x-xa)>unit&&Math.abs(x-xb)>unit);
   if(p.length)parts.push(<path key="proj" d={p.map(x=>`M${sx(x,HAIR)} ${T}V${B}`).join('')} stroke={c} strokeWidth={HAIR*unit} strokeDasharray={`${3*unit} ${3*unit}`} opacity=".75" fill="none" pointerEvents="none"/>);
  }
  parts.push(<path key="main" d={d} stroke={c} strokeWidth={MAIN*unit} strokeLinecap="square" fill="none" pointerEvents="none"/>);

  if(m.kind==='QT'){
   const refs:[number|undefined,string,string][]=[[m.rrPrevious,'previous','R▸'],[m.rrCurrent,'current','◂R']];
   for(const [x,name,label] of refs){
    if(x===undefined)continue;
    const X=sx(x,HAIR);
    parts.push(<g key={name} pointerEvents="none"><path d={`M${X} ${m.y-H}V${rBot}`} stroke={c} strokeWidth={HAIR*unit} strokeDasharray={name==='previous'?`${3*unit} ${2*unit}`:undefined}/>{rLabel(x,label)}</g>);
   }
   if(m.rrPrevious!==undefined&&m.rrCurrent!==undefined){
    const yy=sy(rKnob,HAIR);
    parts.push(<path key="rrlink" d={`M${sx(m.rrPrevious,HAIR)} ${yy}H${sx(m.rrCurrent,HAIR)}`} stroke={c} strokeWidth={HAIR*unit} opacity=".7" pointerEvents="none"/>);
   }
  }

  if(m.tangent){
   const t=m.tangent,Bs=sy(t.base,HAIR);
   parts.push(<path key="base" d={`M${Math.max(0,left-H)} ${Bs}H${Math.min(doc.width,right+H*2)}`} stroke={INK} strokeWidth={HAIR*unit} opacity=".85" pointerEvents="none"/>);
   if(end!==null)parts.push(<path key="ext" d={`M${t.b.x} ${t.b.y}L${end} ${t.base}`} stroke={c} strokeWidth={HAIR*unit} strokeDasharray={`${3*unit} ${2*unit}`} pointerEvents="none"/>);
    parts.push(<path key="tan" d={`M${t.a.x} ${t.a.y}L${t.b.x} ${t.b.y}`} stroke={c} strokeWidth={MAIN*unit} pointerEvents="none"/>);
   if(end!==null)parts.push(<circle key="cross" cx={end} cy={t.base} r={3*unit} fill="#fff" stroke={c} strokeWidth={MAIN*unit} pointerEvents="none"/>);
  }


  // Mientras se marca una R, el calibre queda bloqueado: solo la R puede cambiar.
  if(!calibrating&&!isDraft&&!markMode){
   parts.push(<rect key="hmove" data-handle="move" data-measure={m.id} x={left} y={m.y-16*unit} width={right-left} height={32*unit} fill="transparent" style={{cursor:chosen?'grab':'pointer'}}/>);
   parts.push(jawRect(xa,-dir,'x1'));
   if(!m.tangent)parts.push(jawRect(xb,dir,'x2'));
  }

  // Valor: píldora sobre las mordazas; en RR extendido, la amplitud va al costado de la mordaza derecha.
  parts.push(<g key="pill">{pill(mx,Math.min(T,B)-(8+PILL_H/2)*unit,value,c,useQtc?'QTc':m.kind,isDraft||calibrating||markMode?null:'move',m)}</g>);

  if(chosen&&!markMode){
   // Manijas solo en los cuatro extremos de las líneas: el punto de medida queda libre.
   const ends:[number,number,number,string,string][]=[[xa,X1,-dir,'x1',''],...(m.tangent?[]:[[xb,X2,dir,'x2','']] as [number,number,number,string,string][])];
   for(const [x,X,sgn,nm] of ends){
    for(const [yy,Yy,k] of [[topY,T,'t'],[botY,B,'b']] as const){
     parts.push(knob(m,X,Yy,nm+k,c));
     const a=x-sgn*outer,b2=x+sgn*inner;
     parts.push(<rect key={'e'+nm+k} data-handle={nm+k} data-measure={m.id} x={Math.min(a,b2)} y={yy-HIT/2*unit} width={Math.abs(b2-a)} height={HIT*unit} fill="transparent" style={{cursor:'ew-resize'}}/>);
    }
   }
   if(m.kind==='QT'){
    if(m.rrPrevious!==undefined){parts.push(knob(m,m.rrPrevious,rKnob,'previous',c),hitCircle(m,m.rrPrevious,rKnob,'previous','ew-resize'));}
    if(m.rrCurrent!==undefined){parts.push(knob(m,m.rrCurrent,rKnob,'current',c),hitCircle(m,m.rrCurrent,rKnob,'current','ew-resize'));}
   }
   if(m.tangent){
    const t=m.tangent,bx=Math.min(doc.width,right+H);
    parts.push(<path key="hline" data-handle="line" data-measure={m.id} d={`M${t.a.x} ${t.a.y}L${t.b.x} ${t.b.y}`} stroke="transparent" strokeWidth={28*unit} style={{cursor:'grab'}}/>);
    parts.push(<path key="hbase" data-handle="base" data-measure={m.id} d={`M${left} ${t.base}H${bx}`} stroke="transparent" strokeWidth={24*unit} style={{cursor:'ns-resize'}}/>);
    parts.push(knob(m,t.a.x,t.a.y,'a',c),knob(m,t.b.x,t.b.y,'b',c),knob(m,bx,t.base,'base',INK));
    parts.push(hitCircle(m,t.a.x,t.a.y,'a','move'),hitCircle(m,t.b.x,t.b.y,'b','move'),hitCircle(m,bx,t.base,'base','ns-resize'));
   }
  }

  return <g key={m.id} data-measure={isDraft?undefined:m.id} opacity={calibrating?.3:dim?.3:1} pointerEvents={dim||calibrating?'none':undefined} style={{transition:'opacity .2s'}}>{parts}</g>;
 }

 /** Zoom del lienzo alrededor de un punto de pantalla (o de la mordaza agarrada, si hay una medida en foco). */
 function zoomAt(cursor:Point,r:number){
  const p=anchorFor(cursor)??cursor;
  if(calibrating&&calMode==='grid'){
   const point=local(p);
   props.onChange({...state,calibration:scaled(state.calibration,r,point,point,axis)});
   return;
  }
  const rect=svg.current!.getBoundingClientRect(),cx=rect.left+size.w/2,cy=rect.top+size.h/2;
  setCamera(c=>{
   const z=clamp(c.zoom*r,.3,100),k=z/c.zoom;
   return {zoom:z,pan:{x:p.x-cx-(p.x-cx-c.pan.x)*k,y:p.y-cy-(p.y-cy-c.pan.y)*k}};
  });
 }
 /** Dos dedos en el trackpad (o la rueda) desplazan el lienzo; solo el pellizco (Ctrl+rueda / gestos de Safari) hace zoom. */
 function panBy(dx:number,dy:number,at:Point){
  if(calibrating&&calMode==='grid'){
   const a=local(at),b=local({x:at.x-dx,y:at.y-dy});
   props.onChange({...state,calibration:{...state.calibration,x:state.calibration.x+(b.x-a.x),y:state.calibration.y+(b.y-a.y)}});
   return;
  }
  setCamera(c=>({...c,pan:{x:c.pan.x-dx,y:c.pan.y-dy}}));
 }
 const input=useRef({zoomAt,panBy});input.current={zoomAt,panBy};
 useEffect(()=>{
  const el=svg.current;if(!el)return;
  const onWheel=(e:WheelEvent)=>{
   e.preventDefault();
   if(pointers.current.size)return;
   const k=e.deltaMode===1?16:e.deltaMode===2?size.h:1,at={x:e.clientX,y:e.clientY};
   if(e.ctrlKey||e.metaKey)input.current.zoomAt(at,Math.exp(clamp(-e.deltaY*k*.01,-1,1)));
   else input.current.panBy(e.deltaX*k,e.deltaY*k,at);
  };
  let last=1;
  const gStart=(e:Event)=>{e.preventDefault();last=1;};
  const gChange=(e:Event)=>{
   e.preventDefault();
   const g=e as Event&{scale:number;clientX:number;clientY:number};
   if(!g.scale||!last)return;
   input.current.zoomAt({x:g.clientX,y:g.clientY},g.scale/last);last=g.scale;
  };
  el.addEventListener('wheel',onWheel,{passive:false});
  el.addEventListener('gesturestart',gStart);el.addEventListener('gesturechange',gChange);
  return()=>{el.removeEventListener('wheel',onWheel);el.removeEventListener('gesturestart',gStart);el.removeEventListener('gesturechange',gChange);};
 },[size.h]);

 /** Documento con las medidas dibujadas, a resolución del original (hasta 4096 px). */
 async function exportImage():Promise<Blob>{
  const S=Math.min(doc.kind==='pdf'?3:1,4096/Math.max(doc.width,doc.height)),W=Math.round(doc.width*S),H=Math.round(doc.height*S);
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('No se pudo crear la imagen.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  if(doc.kind==='pdf'&&doc.pdf){
   const pg=await doc.pdf.getPage(doc.page);
   await pg.render({canvasContext:ctx,viewport:pg.getViewport({scale:S}),background:'white'}).promise;
  }else{
   const im=new Image();im.src=doc.url;await im.decode();ctx.drawImage(im,0,0,W,H);
  }
  flushSync(()=>setForced(1000/doc.width));
  const nodes=[...(group.current?.querySelectorAll(':scope > g > g[data-measure]')||[])].map(n=>n.outerHTML).join('');
  flushSync(()=>setForced(null));
  const markup=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${doc.width} ${doc.height}" width="${W}" height="${H}">${nodes}</svg>`;
  const ov=new Image();ov.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup);await ov.decode();
  ctx.drawImage(ov,0,0,W,H);
  return await new Promise<Blob>((ok,fail)=>canvas.toBlob(b=>b?ok(b):fail(Error('No se pudo generar la imagen.')),'image/png'));
 }
 if(props.exportRef)props.exportRef.current=exportImage;

 const showGrid=(calibrating&&calMode==='grid')||gridVisible;
 const ordered=quad.length===4?orderQuad(quad):quad;

 /** Grilla de calibración como líneas explícitas (los patrones SVG recortan la mitad del trazo en el borde de cada celda). */
 function gridLayer(){
  const c=state.calibration,mod5=(i:number)=>((i%5)+5)%5;
  return [1,5,25].map(k=>{
   const stepX=c.sx*k,stepY=c.sy*k,w=k===25?MAIN:HAIR;
   let d='';
   if(stepX*scale>=4)for(const x of positions(c.x,stepX,doc.width)){if(k<25&&mod5(Math.round((x-c.x)/stepX))===0)continue;const X=sx(x,w);d+=`M${X} 0V${doc.height}`;}
   if(stepY*scale>=4)for(const y of positions(c.y,stepY,doc.height)){if(k<25&&mod5(Math.round((y-c.y)/stepY))===0)continue;const Y=sy(y,w);d+=`M0 ${Y}H${doc.width}`;}
   return d?<path key={k} d={d} stroke={k===25?GRID_BOLD:GRID_FINE} strokeWidth={w*unit} opacity={k===1?.55:1} fill="none"/>:null;
  });
 }

 const creating=['PR','QRS','QT','RR'].includes(tool)||tool==='previous'||tool==='current'||quadMode;

 return (
  <div ref={host} className="stage">
   <svg
    ref={svg}
    viewBox={`0 0 ${size.w} ${size.h}`}
    style={{cursor:creating?'crosshair':calibrating?'move':'default'}}
    onContextMenu={e=>e.preventDefault()}
    onPointerDown={down}
    onPointerMove={move}
    onPointerUp={up}
    onPointerCancel={cancelPointer}
    onLostPointerCapture={e=>{if(pointers.current.has(e.pointerId))cancelPointer();}}
   >
    <g ref={group} transform={`translate(${size.w/2+camera.pan.x} ${size.h/2+camera.pan.y}) scale(${scale}) rotate(${rotation}) translate(${-doc.width/2} ${-doc.height/2})`}>
     <g id={contentID}>
      <rect width={doc.width} height={doc.height} fill="white"/>
      {doc.kind==='image'?<image href={doc.url} width={doc.width} height={doc.height} pointerEvents="none"/>:<PDFLayer key={`${doc.url}-${doc.page}`} doc={doc} scale={scale} onError={props.onNotice}/>}
      {showGrid&&<g opacity={opacity} pointerEvents="none">{gridLayer()}</g>}

      {state.measures.map(m=>renderMeasure(m,false))}
      {draft&&renderMeasure(draft,true)}

      {quadMode&&(()=>{
       const H=ordered.length===4?paperToImage(ordered,SQUARE_MM):null;
       const line=(a:Point,b:Point)=>{const p=applyH(H!,a),q=applyH(H!,b);return p&&q?`M${p.x} ${p.y}L${q.x} ${q.y}`:'';};
       const cell=Math.hypot(ordered[1]?.x-ordered[0]?.x||0,ordered[1]?.y-ordered[0]?.y||0)*scale/SQUARE_MM;
       const mm=Array.from({length:SQUARE_MM+1},(_,i)=>i);
       const edge=quad.length>1?`M${ordered.map(p=>`${p.x} ${p.y}`).join('L')}${quad.length===4?'Z':''}`:'';
       return (
        <g>
         {H&&cell>=5&&<path d={mm.filter(i=>i%5).map(i=>line({x:i,y:0},{x:i,y:SQUARE_MM})+line({x:0,y:i},{x:SQUARE_MM,y:i})).join('')} stroke={GRID_FINE} strokeWidth={HAIR*unit} opacity=".5" fill="none" pointerEvents="none"/>}
         {H&&<path d={mm.filter(i=>i%5===0&&i>0&&i<SQUARE_MM).map(i=>line({x:i,y:0},{x:i,y:SQUARE_MM})+line({x:0,y:i},{x:SQUARE_MM,y:i})).join('')} stroke={GRID_FINE} strokeWidth={HAIR*unit} fill="none" pointerEvents="none"/>}
         {edge&&<path d={edge} stroke="rgba(28,28,30,.45)" strokeWidth={(MAIN+2)*unit} strokeLinejoin="round" fill="none" pointerEvents="none"/>}
         {edge&&<path d={edge} stroke={QUAD} strokeWidth={MAIN*unit} strokeLinejoin="round" fill="none" pointerEvents="none"/>}
         {quad.map((p,i)=>{
          const r=7*unit,g=2.5*unit,L=12*unit,cross=`M${p.x-L} ${p.y}H${p.x-g}M${p.x+g} ${p.y}H${p.x+L}M${p.x} ${p.y-L}V${p.y-g}M${p.x} ${p.y+g}V${p.y+L}`;
          return (
           <g key={i} data-qpoint={i} style={{cursor:'move'}}>
            <circle cx={p.x} cy={p.y} r={HIT/2*unit} fill="transparent"/>
            <g pointerEvents="none">
             <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="rgba(28,28,30,.45)" strokeWidth={(MAIN+2)*unit}/>
             <path d={cross} stroke="rgba(28,28,30,.45)" strokeWidth={(HAIR+1.5)*unit}/>
             <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={QUAD} strokeWidth={MAIN*unit}/>
             <path d={cross} stroke={QUAD} strokeWidth={MAIN*unit}/>
             <circle cx={p.x+14*unit} cy={p.y-14*unit} r={7.5*unit} fill="rgba(28,28,30,.82)"/>
             <text x={p.x+14*unit} y={p.y-14*unit} dy=".36em" textAnchor="middle" fontSize={10*unit} fontWeight={700} fill={QUAD} style={{fontVariantNumeric:'tabular-nums',userSelect:'none'}}>{i+1}</text>
            </g>
           </g>
          );
         })}
        </g>
       );
      })()}
     </g>
    </g>
   </svg>

   {lens&&(()=>{
    const half=17*unit,u=half*2/124,g=4*u,L=half;
    return (
     <div className="lens" aria-label="Lupa de precisión">
      <svg viewBox={`${lens.x-half} ${lens.y-half} ${half*2} ${half*2}`}>
       <use href={`#${contentID}`}/>
       <path d={`M${lens.x-L} ${lens.y}H${lens.x-g}M${lens.x+g} ${lens.y}H${lens.x+L}M${lens.x} ${lens.y-L}V${lens.y-g}M${lens.x} ${lens.y+g}V${lens.y+L}`} stroke={HALO} strokeWidth={3*u}/>
       <path d={`M${lens.x-L} ${lens.y}H${lens.x-g}M${lens.x+g} ${lens.y}H${lens.x+L}M${lens.x} ${lens.y-L}V${lens.y-g}M${lens.x} ${lens.y+g}V${lens.y+L}`} stroke="#FF9F0A" strokeWidth={u}/>
      </svg>
     </div>
    );
   })()}

  </div>
 );
}
