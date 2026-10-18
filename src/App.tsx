import {createContext,useCallback,useContext,useEffect,useRef,useState,type CSSProperties} from 'react';
import Stage,{KIND_COLOR,type Tool} from './Stage';
import Icon from './Icons';
import {loadDocument,download,pageText,type DocumentData} from './documents';
import {copy,scaled,validCalibration,initialCalibration,readout,translate,measuresCSV,parseGain,gainOf,FORMULAS,orderQuad,quadProblem,axisAligned,quadCalibration,SQUARE_MM,type Point,type State,type Axis,type Kind,type Formula,type Measure} from './model';
import {rectify} from './rectify';
import {detectDocument} from './autogrid';
import {pageScale,gridDeviation,PT_PER_MM} from './pdfvector';

type ActiveBar='main'|'measure'|'cal';
type ModalSheet='records'|null;
const KINDS:Kind[]=['PR','QRS','QT','RR'];
const SPEEDS=['25','50'],GAINS=['5','10','20'];
const newState=():State=>({calibration:initialCalibration(),measures:[]});
const Busy=createContext(false);

/** Botón de símbolo: 44 pt de objetivo, etiqueta accesible y tooltip en escritorio. Fuera de App para no remontarse en cada render. */
function Btn({icon,label,onPress,active=false,disabled=false,className=''}:{icon:string;label:string;onPress:()=>void;active?:boolean;disabled?:boolean;className?:string}){
 const busy=useContext(Busy);
 return (
  <button type="button" aria-label={label} title={label} aria-pressed={active||undefined} className={'sf-btn '+className+(active?' on':'')} onClick={onPress} disabled={disabled||busy}>
   <Icon name={icon}/>
  </button>
 );
}
/** Selector compacto con el control nativo (rueda en iOS, menú en escritorio). */
function PillSelect({label,value,options,onChange,suffix}:{label:string;value:string;options:string[];onChange:(v:string)=>void;suffix?:string}){
 const list=options.includes(value)?options:[...options,value];
 return (
  <label className="pill-select" title={label}>
   <select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>
    {list.map(o=><option key={o} value={o}>{o.replace('.',',')}{suffix?' '+suffix:''}</option>)}
   </select>
   <span aria-hidden="true">{value.replace('.',',')}{suffix&&<small>{suffix}</small>}</span>
   <Icon name="chevronUpDown"/>
  </label>
 );
}

export default function App(){
 const [doc,setDoc]=useState<DocumentData|null>(null);
 const [state,setState]=useState<State>(newState);
 const [selected,setSelected]=useState<string|null>(null);
 const [tool,setTool]=useState<Tool>('move');
 const [activeBar,setActiveBar]=useState<ActiveBar>('main');
 const [modal,setModal]=useState<ModalSheet>(null);
 const [axis,setAxis]=useState<Axis>('x');
 const [formula,setFormula]=useState<Formula>('Bazett');
 const [opacity,setOpacity]=useState(.55);
 const [gridVisible,setGridVisible]=useState(false);
 const [rotation,setRotation]=useState(0);
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [speedText,setSpeedText]=useState('25');
 const [gainText,setGainText]=useState('10');

 const stateRef=useRef(state);stateRef.current=state;
 const docRef=useRef(doc);docRef.current=doc;
 const undoStack=useRef<State[]>([]),redoStack=useRef<State[]>([]);
 const [canUndo,setCanUndo]=useState(false);
 const [canRedo,setCanRedo]=useState(false);
 const calSnapshot=useRef<State|null>(null),calDoc=useRef<DocumentData|null>(null);
 const [calMode,setCalMode]=useState<'grid'|'quad'>('grid');
 const [calQuad,setCalQuad]=useState<Point[]>([]);
 const fileInput=useRef<HTMLInputElement>(null);
 const noticeTimer=useRef<ReturnType<typeof setTimeout>>();

 const syncHistory=useCallback(()=>{
  setCanUndo(undoStack.current.length>0);
  setCanRedo(redoStack.current.length>0);
 },[]);

 const notify=useCallback((s:string)=>{
  setNotice(s);
  if(noticeTimer.current)clearTimeout(noticeTimer.current);
  noticeTimer.current=setTimeout(()=>setNotice(''),Math.min(6000,Math.max(2600,1500+s.length*45)));
 },[]);

 useEffect(()=>()=>{if(noticeTimer.current)clearTimeout(noticeTimer.current);},[]);
 function release(d:DocumentData|null){
  if(!d)return;
  URL.revokeObjectURL(d.url);
  if(d.original)release(d.original);else void d.pdf?.destroy();
 }

 function change(s:State){stateRef.current=s;setState(s);}
 function record(before:State){
  undoStack.current.push(copy(before));
  if(undoStack.current.length>80)undoStack.current.shift();
  redoStack.current=[];
  syncHistory();
 }
 function commit(fn:(s:State)=>State){record(stateRef.current);change(fn(copy(stateRef.current)));}

 useEffect(()=>{
  const onPaste=(e:ClipboardEvent)=>{
   const f=Array.from(e.clipboardData?.files||[]).find(x=>x.type.startsWith('image/')||x.type==='application/pdf');
   if(f){e.preventDefault();void openFile(f);}
  };
  window.addEventListener('paste',onPaste);
  return ()=>window.removeEventListener('paste',onPaste);
 });

 const m=state.measures.find(m=>m.id===selected)||null;
 const calibrating=activeBar==='cal';

 function allowed(){
  if(calSnapshot.current){notify('Terminá o cancelá la calibración antes de cambiar de herramienta.');return false;}
  return true;
 }

 function beginCalibration(){
  if(!doc){notify('Primero abrí una imagen o un PDF.');return;}
  if(calSnapshot.current)return;
  calSnapshot.current=copy(stateRef.current);
  calDoc.current=doc;
  setCalQuad([]);
  const fromPhoto=doc.original||doc.kind==='image';
  setCalMode(fromPhoto?'quad':'grid');
  if(doc.original){setDoc(doc.original);change(newState());}
  setAxis('x');
  setSpeedText(String(stateRef.current.calibration.speed||25));
  setGainText(String(gainOf(stateRef.current.calibration)));
  setTool('move');
  setActiveBar('cal');
  setModal(null);
  notify(fromPhoto?'Tocá las 4 esquinas de un cuadrado de 25 mm, desde arriba a la izquierda':'Un dedo mueve la grilla · dos dedos la escalan');
  if(fromPhoto)void suggestQuad(doc.original??doc);
 }

 function cancelCalibration(){
  if(calSnapshot.current){change(calSnapshot.current);calSnapshot.current=null;}
  if(calDoc.current&&calDoc.current!==docRef.current)setDoc(calDoc.current);
  calDoc.current=null;setCalQuad([]);
  setActiveBar('main');
  notify('Calibración anterior restaurada.');
 }

/** Calibra con un cuadrado de 25 mm: escala directa si ya está recto; si no, endereza la imagen. */
 async function calibrateQuad(d:DocumentData,q:Point[],speed:number,keep:Measure[]):Promise<{state:State;doc?:DocumentData}>{
  if(axisAligned(q)){
   const c=quadCalibration(q,SQUARE_MM,speed);
   if(!validCalibration(c))throw Error('Escala inválida.');
   return {state:{calibration:c,measures:keep}};
  }
  const r=await rectify(d,q,SQUARE_MM);
  return {state:{calibration:{sx:r.ppmm,sy:r.ppmm,x:r.origin.x,y:r.origin.y,speed,confirmed:true},measures:[]},doc:r.doc};
 }

 /** Busca la grilla y deja las 4 esquinas sugeridas sobre el cuadrado de 25 mm. */
 async function suggestQuad(d:DocumentData){
  setBusy(true);
  try{
   const det=await detectDocument(d);
   if(!det){notify('No encontré la grilla: marcá las esquinas.');return;}
   setCalQuad(det.quad);
   notify(det.confidence>=.7?'Esquinas detectadas · ajustalas si hace falta':'Detección dudosa · revisá las esquinas');
  }catch{
   notify('No pude analizar la imagen: marcá las esquinas.');
  }finally{
   setBusy(false);
  }
 }

 function modeChange(mode:'grid'|'quad'){
  setCalMode(mode);
  setCalQuad([]);
  notify(mode==='quad'?'Tocá las 4 esquinas de un cuadrado de 25 mm, desde arriba a la izquierda':'Un dedo mueve la grilla · dos dedos la escalan');
 }

 function finishCalibration(next:State,newDoc?:DocumentData){
  const snap=calDoc.current;
  if(snap&&snap.original&&snap!==(newDoc??docRef.current))URL.revokeObjectURL(snap.url);
  if(newDoc){setDoc(newDoc);undoStack.current=[];redoStack.current=[];syncHistory();setSelected(null);}
  else if(calSnapshot.current)record(calSnapshot.current);
  change(next);
  calSnapshot.current=null;calDoc.current=null;setCalQuad([]);
  setActiveBar('main');
 }

 async function applyCalibration(){
  const speed=Number(speedText),gain=Number(gainText);
  if(!Number.isFinite(speed)||speed<=0||speed>1000){notify('Indicá una velocidad válida.');return;}
  if(!Number.isFinite(gain)||gain<=0||gain>1000){notify('Indicá una ganancia válida.');return;}
  if(calMode==='quad'){
   if(calQuad.length<4){notify('Marcá las 4 esquinas.');return;}
   const q=orderQuad(calQuad),problem=quadProblem(q);
   if(problem){notify(problem);return;}
   if(!doc)return;
   setBusy(true);
   try{
    const r=await calibrateQuad(doc,q,speed,stateRef.current.measures);
    r.state.calibration.gain=gain;
    finishCalibration(r.state,r.doc);
    notify(r.doc?'Imagen enderezada y calibrada.':'Calibrado.');
   }catch(e){
    notify(e instanceof Error?e.message:'No se pudo calibrar.');
   }finally{
    setBusy(false);
   }
   return;
  }
  const c={...stateRef.current.calibration,speed,gain,confirmed:true};
  if(!validCalibration(c)){notify('Escala inválida.');return;}
  finishCalibration({...stateRef.current,calibration:c});
  notify('Calibrado.');
 }

 function nudge(r:number){
  if(!doc)return;
  const p={x:doc.width/2,y:doc.height/2};
  change({...state,calibration:scaled(state.calibration,r,p,p,axis)});
 }

 function undo(){
  if(calSnapshot.current){cancelCalibration();return;}
  const prev=undoStack.current.pop();
  if(!prev){notify('Nada para deshacer.');return;}
  redoStack.current.push(copy(stateRef.current));
  change(prev);
  setSelected(null);
  syncHistory();
 }

 function redo(){
  if(!allowed())return;
  const next=redoStack.current.pop();
  if(next){
   undoStack.current.push(copy(stateRef.current));
   change(next);
   setSelected(null);
   syncHistory();
  }
 }

 function updateMeasure(fn:(m:Measure)=>void){
  if(!m)return;
  commit(s=>{const mm=s.measures.find(x=>x.id===m.id);if(mm)fn(mm);return s;});
 }

 function nudgeMeasure(deltaMS:number){
  if(!m)return;
  const speed=state.calibration.speed||25,sx=state.calibration.sx||8;
  const dx=(deltaMS/1000)*sx*speed;
  commit(s=>{
   const mm=s.measures.find(x=>x.id===m.id);
   if(mm)translate(mm,dx,0);
   return s;
  });
 }

 function nudgeMeasureEnd(deltaMS:number){
  if(!m)return;
  const speed=state.calibration.speed||25,sx=state.calibration.sx||8;
  const dx=(deltaMS/1000)*sx*speed;
  commit(s=>{
   const mm=s.measures.find(x=>x.id===m.id);
   if(mm){mm.x2+=dx;}
   return s;
  });
 }

 function chooseTool(kind:Kind){
  if(!doc){notify('Abrí un documento.');return;}
  if(!state.calibration.confirmed){
   notify('Calibrá el tiempo antes de medir.');
   beginCalibration();
   return;
  }
  setTool(kind);
  setSelected(null);
  setActiveBar('measure');
  notify(`${kind}: arrastrá sobre el trazado`);
 }

 function selectMeasure(id:string|null){
  setSelected(id);
  if(id){
   setTool('move');
   setActiveBar('measure');
  }
 }

 /** PDF: escala física del papel y velocidad impresa; avisa si la grilla dibujada no coincide. */
 async function autoCalibrate(d:DocumentData):Promise<{state:State;message:string}>{
  let speed:number|null=null,pitch:number|null=null,gain:number|null=null;
  try{({speed,pitch}=await pageScale(d));}catch{/* sin lectura vectorial: se usa la escala física con 25 mm/s */}
  try{gain=parseGain(await pageText(d));}catch{/* sin texto: 10 mm/mV */}
  const v=speed??25,dev=pitch?gridDeviation(pitch):null;
  const warn=dev!==null&&Math.abs(dev)>.005?` · la grilla del PDF difiere ${dev>0?'+':''}${(dev*100).toFixed(1).replace('.',',')} %, verificá`:'';
  return {
   state:{calibration:{sx:PT_PER_MM,sy:PT_PER_MM,x:0,y:0,speed:v,confirmed:true,...(gain?{gain}:{})},measures:[]},
   message:`Calibrado · ${String(v).replace('.',',')} mm/s${speed?'':' (supuesta)'}${gain?` · ${String(gain).replace('.',',')} mm/mV`:''}${warn}`
  };
 }

 async function openFile(file:File){
  if(!allowed())return;
  setBusy(true);
  try{
   const d=await loadDocument(file);
   release(docRef.current);
   setDoc(d);
   let auto:{state:State;message:string}|null=null;
   if(d.kind==='pdf'){auto=await autoCalibrate(d);setGridVisible(false);}
   else{
    const det=await detectDocument(d).catch(()=>null);
    if(det&&det.confidence>=.7){
     try{
      const r=await calibrateQuad(d,det.quad,25,[]);
      auto={state:r.state,message:'Calibrado automáticamente · 25 mm/s (supuesta) · verificá la grilla'};
      if(r.doc)setDoc(r.doc);
      setGridVisible(true);
     }catch{auto=null;}
    }
   }
   change(auto?auto.state:newState());
   setSelected(null);
   setTool('move');
   setActiveBar('main');
   undoStack.current=[];redoStack.current=[];syncHistory();
   setModal(null);
   notify(auto?auto.message:'Calibrá para empezar a medir.');
  }catch(e){
   notify(e instanceof Error?e.message:'No se pudo abrir.');
  }finally{
   setBusy(false);
  }
 }

 async function page(delta:number){
  if(!doc?.pdf||!allowed())return;
  const n=doc.page+delta;
  if(n<1||n>doc.pages)return;
  setBusy(true);
  try{
   const pg=await doc.pdf.getPage(n),vp=pg.getViewport({scale:1});
   const nd={...doc,page:n,width:vp.width,height:vp.height},auto=await autoCalibrate(nd);
   setDoc(nd);
   change(auto.state);
   setSelected(null);
   undoStack.current=[];redoStack.current=[];syncHistory();
   notify(auto.message);
  }catch(e){
   notify(e instanceof Error?e.message:'Error de página.');
  }finally{
   setBusy(false);
  }
 }

 function csv(){
  if(!doc||!allowed())return;
  download('medidas-ecg.csv',measuresCSV(state),'text/csv;charset=utf-8');
  notify('CSV descargado');
 }

 function tangent(){
  if(!m||m.kind!=='QT')return;
  const w=Math.max(1,Math.abs(m.x2-m.x1));
  updateMeasure(x=>{x.tangent={a:{x:x.x2-w*.3,y:x.y-w*.25},b:{x:x.x2,y:x.y},base:x.y};});
  notify('Arrastrá la recta sobre la pendiente de T y la base hasta la isoeléctrica');
 }

 function angleChange(degrees:number){
  if(!m?.tangent)return;
  const a=m.tangent.a,b=m.tangent.b,c={x:(a.x+b.x)/2,y:(a.y+b.y)/2},r=Math.hypot(b.x-a.x,b.y-a.y)/2,t=degrees*Math.PI/180;
  updateMeasure(mm=>{
   if(mm.tangent){
    mm.tangent.a={x:c.x-r*Math.cos(t),y:c.y-r*Math.sin(t)};
    mm.tangent.b={x:c.x+r*Math.cos(t),y:c.y+r*Math.sin(t)};
   }
  });
 }


 const done=(fn:()=>void,label:string)=>(
  <button type="button" aria-label={label} title={label} className="done-btn" onClick={fn}><Icon name="check"/></button>
 );

 const angle=m?.tangent?Math.atan2(m.tangent.b.y-m.tangent.a.y,m.tangent.b.x-m.tangent.a.x)*180/Math.PI:0;
 const r=m?readout(m,state.calibration,formula):null;
 const removeMeasure=()=>{if(!m)return;commit(s=>({...s,measures:s.measures.filter(x=>x.id!==m.id)}));setSelected(null);};

 const context=m&&m.kind==='QT'?(
  <>
   <PillSelect label="Fórmula de QTc" value={formula} options={FORMULAS} onChange={v=>setFormula(v as Formula)}/>
   <div className="chips" role="group" aria-label="Referencias R para QTc">
    {([['current','R','R de este QT',m.rrCurrent],['previous','R ant.','R anterior',m.rrPrevious]] as const).map(([t,txt,label,v])=>(
     <button key={t} type="button" aria-label={label} title={label} aria-pressed={tool===t} className={'chip'+(tool===t?' on':'')+(v!==undefined?' set':'')} onClick={()=>{setTool(tool===t?'move':t);if(tool!==t)notify(t==='current'?'Tocá la R de este QT':'Tocá la R anterior');}}>{txt}</button>
    ))}
   </div>
   <Btn icon="tangent" label={m.tangent?'Quitar tangente':'Tangente de T'} active={!!m.tangent} onPress={()=>m.tangent?updateMeasure(mm=>{delete mm.tangent;}):tangent()}/>
   {m.tangent&&(
    <label className="angle" title="Ángulo de la tangente">
     <input type="range" min="-179" max="179" step=".5" value={angle} aria-label="Ángulo de la tangente" onChange={e=>angleChange(+e.target.value)}/>
     <span>{angle.toFixed(1).replace('.',',')}°</span>
    </label>
   )}
  </>
 ):m&&m.kind==='RR'?(
  <>
   <Btn icon="projection" label={m.projection?'Ocultar proyección':'Proyectar intervalo'} active={m.projection} onPress={()=>updateMeasure(mm=>{mm.projection=!mm.projection;})}/>
   {r?.amplitude?(
    <span className="amp">
     <Icon name="arrowY"/>
     <span>{r.amplitude}</span>
     <button type="button" className="amp-clear" aria-label="Quitar amplitud" title="Quitar amplitud" onClick={()=>updateMeasure(mm=>{delete mm.top;delete mm.bottom;})}><Icon name="close"/></button>
    </span>
   ):(
    <span className="amp hint"><Icon name="arrowY"/><span>Estirá ↕ para abarcar derivaciones</span></span>
   )}
  </>
 ):null;

 return (
  <Busy.Provider value={busy}>
  <main className="app" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files?.[0];if(f)void openFile(f);}}>
   {doc?(
    <Stage
     doc={doc}
     state={state}
     tool={tool}
     calibrating={calibrating}
     calMode={calMode}
     quad={calQuad}
     onQuad={setCalQuad}
     axis={axis}
     selected={selected}
     formula={formula}
     gridVisible={gridVisible}
     opacity={opacity}
     rotation={rotation}
     onChange={change}
     onCommit={record}
     onSelect={selectMeasure}
     onNotice={notify}
     onMarked={()=>setTool('move')}
    />
   ):(
    <div className="empty">
     <button type="button" className="open-hero" aria-label="Abrir imagen o PDF" onClick={()=>fileInput.current?.click()}>
      <Icon name="photo"/>
     </button>
     <div className="empty-text">
      <p>Abrí un ECG</p>
      <small>Foto, captura o PDF · también podés soltarlo o pegarlo</small>
     </div>
    </div>
   )}

   <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void openFile(f);}}/>

   {doc&&(
    <header className="top-bar">
     {activeBar==='cal'?(
      <div className="bar-group">{done(()=>void applyCalibration(),'Listo')}<div className="capsule glass"><Btn icon="close" label="Cancelar" className="plain" onPress={cancelCalibration}/></div></div>
     ):activeBar==='measure'?(
      <>
       <div className="bar-group">{done(()=>{setTool('move');setSelected(null);setActiveBar('main');},'Listo')}</div>
       {(canUndo||canRedo)&&(
        <div className="capsule glass">
         <Btn icon="undo" label="Deshacer" disabled={!canUndo} onPress={undo}/>
         <Btn icon="redo" label="Rehacer" disabled={!canRedo} onPress={redo}/>
        </div>
       )}
      </>
     ):(
      <>
       <div className="bar-group">
        <div className="capsule glass"><Btn icon="doc" label="Abrir" onPress={()=>fileInput.current?.click()}/></div>
        {doc.pages>1&&(
         <div className="capsule glass">
          <Btn icon="chevronLeft" label="Página anterior" disabled={doc.page<=1} onPress={()=>void page(-1)}/>
          <span className="page-count">{doc.page}/{doc.pages}</span>
          <Btn icon="chevronRight" label="Página siguiente" disabled={doc.page>=doc.pages} onPress={()=>void page(1)}/>
         </div>
        )}
       </div>
       <div className="bar-group">
        {(canUndo||canRedo)&&(
         <div className="capsule glass">
          <Btn icon="undo" label="Deshacer" disabled={!canUndo} onPress={undo}/>
          <Btn icon="redo" label="Rehacer" disabled={!canRedo} onPress={redo}/>
         </div>
        )}
        <div className="capsule glass">
         <Btn icon="rotate" label="Girar" onPress={()=>setRotation(r=>(r+90)%360)}/>
         <Btn icon="grid" label="Grilla" active={gridVisible} onPress={()=>setGridVisible(v=>!v)}/>
         {state.measures.length>0&&<Btn icon="share" label="Exportar CSV" onPress={csv}/>}
        </div>
       </div>
      </>
     )}
    </header>
   )}

   {notice&&<div key={notice} className="toast glass" role="status">{notice}</div>}
   {busy&&<div className="spinner" role="status" aria-label="Procesando"/>}

   {doc&&(
    <div className="bottom">
     {activeBar==='main'&&(
      <nav className="capsule glass dock" aria-label="Herramientas">
       <Btn icon="caliper" label="Medir" onPress={()=>chooseTool('QT')}/>
       <Btn icon="ruler" label="Calibrar" active={state.calibration.confirmed} onPress={beginCalibration}/>
       {state.measures.length>0&&(
        <span className="badge-wrap">
         <Btn icon="list" label="Medidas" onPress={()=>setModal('records')}/>
         <b className="badge">{state.measures.length}</b>
        </span>
       )}
      </nav>
     )}

     {activeBar==='cal'&&(
      <nav className="card glass cal-card" aria-label="Calibración">
       <div className="cal-row">
        <div className="segmented" role="group" aria-label="Método">
         <button type="button" aria-label="Grilla" title="Grilla" aria-pressed={calMode==='grid'} className={'seg'+(calMode==='grid'?' on':'')} onClick={()=>modeChange('grid')}><Icon name="grid"/></button>
         <button type="button" aria-label="4 puntos" title="4 puntos" aria-pressed={calMode==='quad'} className={'seg'+(calMode==='quad'?' on':'')} onClick={()=>modeChange('quad')}><Icon name="quad"/></button>
        </div>
        {calMode==='grid'?(
         <div className="segmented" role="group" aria-label="Eje">
          {([['both','arrowBoth','Ambos ejes'],['x','arrowX','Tiempo'],['y','arrowY','Amplitud']] as const).map(([a,ic,label])=>(
           <button type="button" key={a} aria-label={label} title={label} aria-pressed={axis===a} className={'seg'+(axis===a?' on':'')} onClick={()=>setAxis(a)}><Icon name={ic}/></button>
          ))}
         </div>
        ):(
         <div className="quad-count">
          <Btn icon="auto" label="Detectar grilla" onPress={()=>{if(docRef.current)void suggestQuad(docRef.current);}}/>
          <span aria-label={`${calQuad.length} de 4 esquinas`}>{calQuad.length}<small>/4</small></span>
          <Btn icon="trash" label="Borrar puntos" disabled={!calQuad.length} className="danger" onPress={()=>setCalQuad([])}/>
         </div>
        )}
       </div>
       <div className="cal-row">
        <PillSelect label="Velocidad del papel" value={speedText} options={SPEEDS} onChange={setSpeedText} suffix="mm/s"/>
        <PillSelect label="Ganancia" value={gainText} options={GAINS} onChange={setGainText} suffix="mm/mV"/>
        {calMode==='grid'&&(
         <>
          <div className="stepper" role="group" aria-label="Escala">
           <Btn icon="minus" label="Reducir escala" onPress={()=>nudge(.98)}/>
           <Btn icon="plus" label="Aumentar escala" onPress={()=>nudge(1.02)}/>
          </div>
          <label className="opacity" title="Opacidad de la grilla">
           <Icon name="opacity"/>
           <input type="range" min=".1" max=".9" step=".02" value={opacity} aria-label="Opacidad de la grilla" onChange={e=>setOpacity(+e.target.value)}/>
          </label>
         </>
        )}
       </div>
      </nav>
     )}

     {activeBar==='measure'&&(
      <>
       {m&&r&&(
        <section className={'card glass hud'+(context?' has-ctx':'')} aria-label="Medida seleccionada" style={{'--kind':KIND_COLOR[m.kind]} as CSSProperties}>
         <output className="readout" aria-live="polite">
          <span className="r-main">
           <span className="r-kind">{m.kind}</span>
           {r.value!==null?<><span className="r-num">{r.value}</span><span className="r-unit">ms</span></>:<span className="r-hint">{r.hint}</span>}
          </span>
          {r.secondary&&<span className="r-sec">{r.secondary}</span>}
         </output>
         <div className="nudge">
          <div className="stepper" role="group" aria-label="Mover 1 ms">
           <Btn icon="chevronLeft" label="Mover 1 ms antes" onPress={()=>nudgeMeasure(-1)}/>
           <Btn icon="chevronRight" label="Mover 1 ms después" onPress={()=>nudgeMeasure(1)}/>
          </div>
          <div className="stepper" role="group" aria-label="Largo 1 ms">
           <Btn icon="minus" label="Acortar 1 ms" disabled={!!m.tangent} onPress={()=>nudgeMeasureEnd(-1)}/>
           <Btn icon="plus" label="Alargar 1 ms" disabled={!!m.tangent} onPress={()=>nudgeMeasureEnd(1)}/>
          </div>
         </div>
         <Btn icon="trash" label="Eliminar medida" className="danger trash" onPress={removeMeasure}/>
         {context&&<div className="ctx">{context}</div>}
        </section>
       )}
       <nav className="segmented kinds glass" aria-label="Tipo de medida">
        {KINDS.map(k=>(
         <button type="button" key={k} aria-pressed={tool===k} className={'seg txt'+(tool===k?' on':'')} style={{'--kind':KIND_COLOR[k]} as CSSProperties} onClick={()=>chooseTool(k)}><i className="kind-dot" aria-hidden="true"/>{k}</button>
        ))}
       </nav>
      </>
     )}
    </div>
   )}

   {modal==='records'&&(
    <div className="backdrop" onClick={()=>setModal(null)}>
     <section className="sheet glass" onClick={e=>e.stopPropagation()} aria-label="Medidas" role="dialog">
      <div className="grabber"/>
      {!state.measures.length?(
       <p className="sheet-empty">Sin medidas</p>
      ):(
       <ul className="rows">
        {state.measures.map(mm=>{
         const rr=readout(mm,state.calibration,formula);
         return (
          <li key={mm.id}>
           <button type="button" className="row" style={{'--kind':KIND_COLOR[mm.kind]} as CSSProperties} onClick={()=>{setSelected(mm.id);setActiveBar('measure');setTool('move');setModal(null);}}>
            <i className="kind-dot" aria-hidden="true"/>
            <span className="row-kind">{mm.kind}</span>
            <span className="row-val">{rr.value!==null?<>{rr.value}<small> ms</small></>:<small>{rr.hint}</small>}</span>
            <span className="row-sec">{[rr.secondary,rr.amplitude].filter(Boolean).join(' · ')}</span>
            <Icon name="chevronRight"/>
           </button>
          </li>
         );
        })}
       </ul>
      )}
     </section>
    </div>
   )}
  </main>
  </Busy.Provider>
 );
}
