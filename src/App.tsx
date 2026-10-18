import {useCallback,useEffect,useRef,useState} from 'react';
import {Button} from 'react-aria-components';
import Stage,{type Tool} from './Stage';
import Icon from './Icons';
import {loadDocument,download,type DocumentData} from './documents';
import {copy,scaled,validCalibration,initialCalibration,summary,duration,previousRR,corrected,intersection,orderQuad,quadProblem,axisAligned,quadCalibration,SQUARE_MM,type Point,type State,type Axis,type Kind,type Formula,type Measure} from './model';
import {rectify} from './rectify';
import {pageScale,gridDeviation,PT_PER_MM} from './pdfvector';

type ActiveBar='main'|'measure'|'cal';
type ModalSheet='records'|null;
const formulas:Formula[]=['Bazett','Fridericia','Framingham','Hodges'];
const newState=():State=>({calibration:initialCalibration(),measures:[]});

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
  noticeTimer.current=setTimeout(()=>setNotice(''),6500);
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
  setTool('move');
  setActiveBar('cal');
  setModal(null);
  notify(fromPhoto?'Tocá las 4 esquinas del cuadrado de 25 mm, en sentido horario desde arriba a la izquierda':'Un dedo mueve la grilla · dos dedos la escalan');
 }

 function cancelCalibration(){
  if(calSnapshot.current){change(calSnapshot.current);calSnapshot.current=null;}
  if(calDoc.current&&calDoc.current!==docRef.current)setDoc(calDoc.current);
  calDoc.current=null;setCalQuad([]);
  setActiveBar('main');
  notify('Calibración anterior restaurada.');
 }

 function modeChange(mode:'grid'|'quad'){
  setCalMode(mode);
  setCalQuad([]);
  notify(mode==='quad'?'Tocá las 4 esquinas del cuadrado de 25 mm, en sentido horario desde arriba a la izquierda':'Un dedo mueve la grilla · dos dedos la escalan');
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
  const speed=Number(speedText);
  if(!Number.isFinite(speed)||speed<=0||speed>1000){notify('Indicá una velocidad válida.');return;}
  if(calMode==='quad'){
   if(calQuad.length<4){notify('Marcá las 4 esquinas.');return;}
   const q=orderQuad(calQuad),problem=quadProblem(q);
   if(problem){notify(problem);return;}
   if(axisAligned(q)){
    const c=quadCalibration(q,SQUARE_MM,speed);
    if(!validCalibration(c)){notify('Escala inválida.');return;}
    finishCalibration({...stateRef.current,calibration:c});
    notify('Calibrado.');
    return;
   }
   if(!doc)return;
   setBusy(true);
   try{
    const r=await rectify(doc,q,SQUARE_MM);
    finishCalibration({calibration:{sx:r.ppmm,sy:r.ppmm,x:r.origin.x,y:r.origin.y,speed,confirmed:true},measures:[]},r.doc);
    notify('Imagen enderezada y calibrada.');
   }catch(e){
    notify(e instanceof Error?e.message:'No se pudo enderezar.');
   }finally{
    setBusy(false);
   }
   return;
  }
  const c={...stateRef.current.calibration,speed,confirmed:true};
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
   if(mm){
    mm.x1+=dx;mm.x2+=dx;
    if(mm.tangent){mm.tangent.a.x+=dx;mm.tangent.b.x+=dx;}
    if(mm.rrPrevious!==undefined)mm.rrPrevious+=dx;
    if(mm.rrCurrent!==undefined)mm.rrCurrent+=dx;
   }
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
  notify(`Modo ${kind}: arrastrá sobre el ECG para medir.`);
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
  let speed:number|null=null,pitch:number|null=null;
  try{({speed,pitch}=await pageScale(d));}catch{/* sin lectura vectorial: se usa la escala física con 25 mm/s */}
  const v=speed??25,dev=pitch?gridDeviation(pitch):null;
  const warn=dev!==null&&Math.abs(dev)>.005?` · la grilla del PDF difiere ${dev>0?'+':''}${(dev*100).toFixed(1)} %, verificá`:'';
  return {
   state:{calibration:{sx:PT_PER_MM,sy:PT_PER_MM,x:0,y:0,speed:v,confirmed:true},measures:[]},
   message:`Calibrado · ${v} mm/s${speed?'':' (supuesta)'}${warn}`
  };
 }

 async function openFile(file:File){
  if(!allowed())return;
  setBusy(true);
  try{
   const d=await loadDocument(file);
   release(docRef.current);
   setDoc(d);
   const auto=d.kind==='pdf'?await autoCalibrate(d):null;
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
  const c=state.calibration;
  const rows=[['tipo','inicio_u','fin_u','intervalo_ms','RR_previo_ms',...formulas,'metodo'],...state.measures.map(m=>{
   const t=duration(m,c),r=previousRR(m,c);
   return [m.kind,m.x1,intersection(m)??'',t??'',r??'',...formulas.map(f=>m.kind==='QT'&&t!==null&&r!==null?corrected(t,r,f)??'':''),m.tangent?'tangente':'directo'];
  })];
  const escape=(x:unknown)=>'"'+String(x).replaceAll('"','""')+'"';
  download('medidas-ecg.csv',`# Medidas ECG Web\n# Velocidad mm/s,${c.speed}\n# Escala X,${c.sx}\n# Escala Y visual,${c.sy}\n`+rows.map(r=>r.map(escape).join(',')).join('\n'),'text/csv;charset=utf-8');
  notify('CSV descargado con éxito.');
 }

 function tangent(){
  if(!m||m.kind!=='QT')return;
  const w=Math.max(1,Math.abs(m.x2-m.x1));
  updateMeasure(x=>{x.tangent={a:{x:x.x2-w*.3,y:x.y-w*.25},b:{x:x.x2,y:x.y},base:x.y};});
  notify('Tangente activada: arrastrá la recta para inclinar y la línea base para nivelar.');
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


 const Btn=({icon,label,onPress,active=false,disabled=false,className=''}:{icon:string;label:string;onPress:()=>void;active?:boolean;disabled?:boolean;className?:string})=>(
  <button type="button" aria-label={label} title={label} className={'sf-btn '+className+(active?' on':'')} onClick={onPress} disabled={disabled||busy}>
   <Icon name={icon}/>
  </button>
 );

 const done=(fn:()=>void,label:string)=>(
  <button type="button" aria-label={label} title={label} className="done-btn" onClick={fn}><Icon name="check"/></button>
 );

 const angle=m?.tangent?Math.atan2(m.tangent.b.y-m.tangent.a.y,m.tangent.b.x-m.tangent.a.x)*180/Math.PI:0;

 return (
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
    />
   ):(
    <div className="empty">
     <Button className="open-hero" aria-label="Abrir imagen o PDF" onPress={()=>fileInput.current?.click()}>
      <Icon name="photo"/>
     </Button>
     <p>Abrí, soltá o pegá un ECG</p>
    </div>
   )}

   <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void openFile(f);}}/>

   {doc&&(
    <header className="top-bar">
     {activeBar==='cal'?(
      <>
       <div className="bar-group">{done(()=>void applyCalibration(),'Listo')}{<Btn icon="close" label="Cancelar" className="plain" onPress={cancelCalibration}/>}</div>
      </>
     ):activeBar==='measure'?(
      <>
       <div className="bar-group">{done(()=>{setTool('move');setSelected(null);setActiveBar('main');},'Listo')}</div>
       {canUndo&&<div className="capsule glass"><Btn icon="undo" label="Deshacer" onPress={undo}/></div>}
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
          {canUndo&&<Btn icon="undo" label="Deshacer" onPress={undo}/>}
          {canRedo&&<Btn icon="redo" label="Rehacer" onPress={redo}/>}
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

   {notice&&<div className="toast glass" role="status">{notice}</div>}
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
       <div className="segmented" role="group" aria-label="Método">
        <button type="button" aria-label="Grilla" title="Grilla" className={'seg'+(calMode==='grid'?' on':'')} onClick={()=>modeChange('grid')}><Icon name="grid"/></button>
        <button type="button" aria-label="4 puntos" title="4 puntos" className={'seg'+(calMode==='quad'?' on':'')} onClick={()=>modeChange('quad')}><Icon name="quad"/></button>
       </div>
       {calMode==='grid'&&(
        <div className="segmented" role="group" aria-label="Eje">
         {([['both','arrowBoth','Ambos ejes'],['x','arrowX','Tiempo'],['y','arrowY','Amplitud']] as const).map(([a,ic,label])=>(
          <button type="button" key={a} aria-label={label} title={label} className={'seg'+(axis===a?' on':'')} onClick={()=>setAxis(a)}><Icon name={ic}/></button>
         ))}
        </div>
       )}
       <div className="segmented" role="group" aria-label="Velocidad">
        {['25','50'].map(v=>(
         <Button key={v} className={'seg txt'+(speedText===v?' on':'')} onPress={()=>setSpeedText(v)}>{v}<small>mm/s</small></Button>
        ))}
       </div>
       {calMode==='grid'?(
        <>
         <div className="stepper">
          <Btn icon="minus" label="Reducir escala" onPress={()=>nudge(.98)}/>
          <Btn icon="plus" label="Aumentar escala" onPress={()=>nudge(1.02)}/>
         </div>
         <label className="opacity" title="Opacidad de la grilla">
          <Icon name="opacity"/>
          <input type="range" min=".1" max=".9" step=".02" value={opacity} onChange={e=>setOpacity(+e.target.value)}/>
         </label>
        </>
       ):(
        <div className="quad-count">
         <span>{calQuad.length}/4</span>
         <Btn icon="trash" label="Borrar puntos" disabled={!calQuad.length} className="danger" onPress={()=>setCalQuad([])}/>
        </div>
       )}
      </nav>
     )}

     {activeBar==='measure'&&(
      <>
       {m&&(
        <div className="card glass hud">
         <div className="hud-row">
          <strong className="hud-title">{summary(m,state.calibration,formula)}</strong>
          {m.kind==='QT'&&(
           <select className="pill-select" aria-label="Fórmula de QTc" value={formula} onChange={e=>setFormula(e.target.value as Formula)}>
            {formulas.map(f=><option key={f} value={f}>{f}</option>)}
           </select>
          )}
          <Btn icon="trash" label="Eliminar" className="danger" onPress={()=>{commit(s=>({...s,measures:s.measures.filter(x=>x.id!==m.id)}));setSelected(null);}}/>
         </div>
         <div className="hud-row tools">
          <div className="stepper" title="Mover 1 ms">
           <Btn icon="chevronLeft" label="Mover 1 ms atrás" onPress={()=>nudgeMeasure(-1)}/>
           <Btn icon="chevronRight" label="Mover 1 ms adelante" onPress={()=>nudgeMeasure(1)}/>
          </div>
          <div className="stepper" title="Largo 1 ms">
           <Btn icon="minus" label="Acortar 1 ms" onPress={()=>nudgeMeasureEnd(-1)}/>
           <Btn icon="plus" label="Alargar 1 ms" onPress={()=>nudgeMeasureEnd(1)}/>
          </div>
          {m.kind==='QT'&&(
           <>
            <Button className={'chip'+(tool==='current'?' on':'')} onPress={()=>{setTool('current');notify('Tocá la R de este QT.');}}>R</Button>
            <Button className={'chip'+(tool==='previous'?' on':'')} onPress={()=>{setTool('previous');notify('Tocá la R anterior.');}}>R ant.</Button>
            <Btn icon="tangent" label={m.tangent?'Quitar tangente':'Tangente de T'} active={!!m.tangent} onPress={()=>m.tangent?updateMeasure(mm=>{delete mm.tangent;}):tangent()}/>
           </>
          )}
          {m.kind==='RR'&&<Button className={'chip'+(m.projection?' on':'')} onPress={()=>updateMeasure(mm=>{mm.projection=!mm.projection;})}>Proyección</Button>}
         </div>
         {m.tangent&&(
          <label className="angle">
           <span>{angle.toFixed(1)}°</span>
           <input type="range" min="-179" max="179" step=".5" value={angle} onChange={e=>angleChange(+e.target.value)}/>
          </label>
         )}
        </div>
       )}
       <nav className="segmented kinds glass" aria-label="Tipo de medida">
        {(['PR','QRS','QT','RR'] as Kind[]).map(k=>(
         <Button key={k} className={'seg txt'+(tool===k?' on':'')} onPress={()=>chooseTool(k)}>{k}</Button>
        ))}
       </nav>
      </>
     )}
    </div>
   )}

   {modal==='records'&&(
    <div className="backdrop" onClick={()=>setModal(null)}>
     <section className="sheet glass" onClick={e=>e.stopPropagation()} aria-label="Medidas">
      <div className="grabber"/>
      {!state.measures.length?(
       <p className="sheet-empty">Sin medidas</p>
      ):(
       <ul className="rows">
        {state.measures.map(mm=>(
         <li key={mm.id}>
          <button className="row" onClick={()=>{setSelected(mm.id);setActiveBar('measure');setTool('move');setModal(null);}}>
           <span>{summary(mm,state.calibration,formula)}</span>
           <Icon name="chevronRight"/>
          </button>
         </li>
        ))}
       </ul>
      )}
     </section>
    </div>
   )}
  </main>
 );
}
