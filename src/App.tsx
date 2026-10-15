import {useCallback,useEffect,useRef,useState} from 'react';
import {Button,Input,Label,TextField} from 'react-aria-components';
import Stage,{type Tool} from './Stage';
import Icon from './Icons';
import {loadDocument,fileToBase64,download,type DocumentData} from './documents';
import {copy,scaled,validCalibration,initialCalibration,summary,duration,previousRR,corrected,intersection,type State,type Axis,type Kind,type Formula,type Measure} from './model';
import {validateSession,sessionFile,type Session} from './session';
import {saveLocal,getLocal,clearLocal} from './storage';

type ActiveBar='main'|'measure'|'cal';
type ModalSheet='file'|'export'|'records'|'options'|null;
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
 const [notice,setNotice]=useState('Abrí un ECG para comenzar.');
 const [busy,setBusy]=useState(false);
 const [speedText,setSpeedText]=useState('25');

 const stateRef=useRef(state);stateRef.current=state;
 const docRef=useRef(doc);docRef.current=doc;
 const undoStack=useRef<State[]>([]),redoStack=useRef<State[]>([]);
 const calSnapshot=useRef<State|null>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 const sessionInput=useRef<HTMLInputElement>(null);
 const noticeTimer=useRef<ReturnType<typeof setTimeout>>();

 const notify=useCallback((s:string)=>{
  setNotice(s);
  if(noticeTimer.current)clearTimeout(noticeTimer.current);
  noticeTimer.current=setTimeout(()=>setNotice(''),6500);
 },[]);

 useEffect(()=>()=>{if(noticeTimer.current)clearTimeout(noticeTimer.current);},[]);
 useEffect(()=>()=>{if(doc){URL.revokeObjectURL(doc.url);void doc.pdf?.destroy();}},[doc?.url]);

 function change(s:State){stateRef.current=s;setState(s);}
 function record(before:State){undoStack.current.push(copy(before));if(undoStack.current.length>80)undoStack.current.shift();redoStack.current=[];}
 function commit(fn:(s:State)=>State){record(stateRef.current);change(fn(copy(stateRef.current)));}

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
  setAxis('x');
  setSpeedText(String(stateRef.current.calibration.speed||25));
  setTool('move');
  setActiveBar('cal');
  setModal(null);
 }

 function cancelCalibration(){
  if(calSnapshot.current){change(calSnapshot.current);calSnapshot.current=null;}
  setActiveBar('main');
  notify('Calibración anterior restaurada.');
 }

 function applyCalibration(){
  const speed=Number(speedText);
  if(!Number.isFinite(speed)||speed<=0||speed>1000){notify('Indicá una velocidad válida.');return;}
  const c={...stateRef.current.calibration,speed,confirmed:true};
  if(!validCalibration(c)){notify('Escala inválida.');return;}
  if(calSnapshot.current)record(calSnapshot.current);
  change({...stateRef.current,calibration:c});
  calSnapshot.current=null;
  setActiveBar('main');
  notify('Calibración aplicada correctamente.');
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
 }

 function redo(){
  if(!allowed())return;
  const next=redoStack.current.pop();
  if(next){undoStack.current.push(copy(stateRef.current));change(next);setSelected(null);}
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

 async function openFile(file:File){
  if(!allowed())return;
  if((state.measures.length||state.calibration.confirmed)&&!window.confirm('Abrir otro documento reemplaza la calibración y medidas actuales. ¿Continuar?'))return;
  setBusy(true);
  try{
   const d=await loadDocument(file);
   setDoc(d);
   change(newState());
   setSelected(null);
   setTool('move');
   setActiveBar('main');
   undoStack.current=[];redoStack.current=[];
   setModal(null);
   notify('Documento abierto. Tocá "Calibrar" para ajustar la grilla.');
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
  if((state.measures.length||state.calibration.confirmed)&&!confirm('Cambiar de página elimina calibración y medidas activas. ¿Continuar?'))return;
  setBusy(true);
  try{
   const pg=await doc.pdf.getPage(n),vp=pg.getViewport({scale:1});
   setDoc({...doc,page:n,width:vp.width,height:vp.height});
   change(newState());
   setSelected(null);
   undoStack.current=[];redoStack.current=[];
   notify('Nueva página: requiere calibrar nuevamente.');
  }catch(e){
   notify(e instanceof Error?e.message:'Error de página.');
  }finally{
   setBusy(false);
  }
 }

 async function makeSession():Promise<Session>{
  if(!doc)throw Error('No hay documento.');
  return {format:'ecg-web-session',version:1,file:{name:doc.file.name,type:doc.file.type,data:await fileToBase64(doc.file)},page:doc.page,state:copy(stateRef.current),formula};
 }

 async function saveSession(local:boolean){
  if(!doc||!allowed())return;
  setBusy(true);
  try{
   const session=await makeSession();
   if(local){
    await saveLocal(session);
    notify('Sesión guardada en este navegador.');
   }else{
    download('sesion-ecg.json',JSON.stringify(session),'application/json');
    notify('Sesión exportada en JSON.');
   }
  }catch(e){
   notify(e instanceof Error?e.message:'No se pudo guardar.');
  }finally{
   setBusy(false);
  }
 }

 async function restore(raw:unknown){
  if(!allowed())return;
  if(state.measures.length&&!confirm('¿Reemplazar la sesión actual?'))return;
  setBusy(true);
  let d:DocumentData|undefined;
  try{
   const s=validateSession(raw);
   d=await loadDocument(sessionFile(s));
   if(s.page>d.pages)throw Error('Página fuera del documento.');
   if(d.pdf){
    const pg=await d.pdf.getPage(s.page),vp=pg.getViewport({scale:1});
    d={...d,page:s.page,width:vp.width,height:vp.height};
   }
   setDoc(d);
   change(copy(s.state));
   setFormula(s.formula);
   setSelected(null);
   undoStack.current=[];redoStack.current=[];
   setTool('move');
   setActiveBar('main');
   setModal(null);
   notify('Sesión restaurada.');
  }catch(e){
   if(d){URL.revokeObjectURL(d.url);void d.pdf?.destroy();}
   notify(e instanceof Error?e.message:'No se pudo restaurar.');
  }finally{
   setBusy(false);
  }
 }

 async function restoreLocal(){
  try{
   const s=await getLocal();
   if(!s){notify('No hay sesión guardada en este navegador.');return;}
   await restore(s);
  }catch{
   notify('No se pudo leer el almacenamiento local.');
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

 const iconBtn=(name:string,label:string,fn:()=>void,active=false)=>(
  <Button aria-label={label} className={'icon-btn'+(active?' active':'')} onPress={fn} isDisabled={busy}>
   <Icon name={name}/>
  </Button>
 );

 return (
  <main className="app-container">
   {doc?(
    <Stage
     doc={doc}
     state={state}
     tool={tool}
     calibrating={calibrating}
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
     <div className="empty-mark"><Icon name="rr"/></div>
     <h1>Tu ECG.<br/>Un lienzo preciso.</h1>
     <p>Abrí una imagen o un archivo PDF.<br/>Todo se procesa en tu navegador con total privacidad.</p>
     <Button className="primary-pill" onPress={()=>fileInput.current?.click()}>Abrir ECG</Button>
     <button className="text-link" onClick={restoreLocal}>Recuperar sesión local</button>
     <small>Beta médica · No certificada para diagnóstico automático</small>
    </div>
   )}

   <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void openFile(f);}}/>
   <input ref={sessionInput} type="file" accept="application/json,.json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f){if(f.size>90_000_000){notify('Sesión demasiado grande.');return;}void f.text().then(t=>restore(JSON.parse(t))).catch(()=>notify('Archivo de sesión inválido.'));}}}/>

   {/* Top Navigation Bar (Header) */}
   <header className="top-bar">
    <div className="glass bar-capsule">
     {iconBtn('file','Documento y Páginas',()=>setModal(modal==='file'?null:'file'),modal==='file')}
    </div>

    {doc&&(
     <div className="glass bar-capsule">
      <button className="icon-btn" title="Rotar 90°" aria-label="Rotar ECG 90 grados" onClick={()=>setRotation(r=>(r+90)%360)}>
       <Icon name="rotate"/>
      </button>
     </div>
    )}

    <div className="right-tools">
     <div className="glass bar-capsule">
      {iconBtn('undo','Deshacer',undo)}
      {iconBtn('redo','Rehacer',redo)}
     </div>
     <div className="glass bar-capsule">
      {iconBtn('share','Exportar medidas o sesión',()=>setModal(modal==='export'?null:'export'),modal==='export')}
      {iconBtn('more','Opciones de cuadrícula y memoria',()=>setModal(modal==='options'?null:'options'),modal==='options')}
     </div>
    </div>
   </header>

   {notice&&<div className="toast-pill glass" role="status">{notice}</div>}
   {busy&&<div className="busy-pill glass" role="status">Procesando…</div>}

   {/* Calibrating Banner indicator at top */}
   {activeBar==='cal'&&(
    <div className="top-instruction-pill glass">
     <span>💡 <strong>1 dedo:</strong> mover grilla &nbsp;|&nbsp; <strong>2 dedos / rueda:</strong> ajustar escala</span>
    </div>
   )}

   {/* BOTTOM DOCK: Follows iOS Notes Markup Logic */}
   {doc&&(
    <div className="bottom-dock-container">

     {/* 1. MAIN DOCK (Default Tool Bar) */}
     {activeBar==='main'&&(
      <nav className="dock-row" aria-label="Herramientas principales">
       <div className="glass bar-capsule main-dock">
        <Button className="dock-pill" onPress={()=>{chooseTool('QT');}}>
         <Icon name="pen"/>
         <span>Medir</span>
        </Button>
        <Button className="dock-pill" onPress={beginCalibration}>
         <Icon name="ruler"/>
         <span>Calibrar</span>
        </Button>
        <Button className="dock-pill" onPress={()=>setModal(modal==='records'?null:'records')}>
         <Icon name="records"/>
         <span>Registros{state.measures.length?` (${state.measures.length})`:''}</span>
        </Button>
        <Button className={'dock-pill '+(tool==='move'?'active':'')} onPress={()=>{setTool('move');setSelected(null);notify('Modo Navegación: arrastrá con 1 dedo para mover el lienzo.');}}>
         <Icon name="rr"/>
         <span>Navegar</span>
        </Button>
       </div>
      </nav>
     )}

     {/* 2. CALIBRATION DOCK (Ultra-Compact iOS Style Bar) */}
     {activeBar==='cal'&&(
      <nav className="dock-cal-wrapper glass" aria-label="Barra de Calibración">
       <div className="cal-sub-row">
        <div className="ios-segmented">
         {([['both','⤢ Ambos'],['x','↔ Tiempo'],['y','↕ Altura']] as const).map(([a,label])=>(
          <Button key={a} className={'segment-btn '+(axis===a?'selected':'')} onPress={()=>setAxis(a)}>{label}</Button>
         ))}
        </div>

        <div className="cal-speed-group">
         <span className="cal-label">Velocidad</span>
         <button
          className="speed-pill-btn"
          title="Alternar velocidad estándar"
          onClick={()=>{
           const next=speedText==='25'?'50':'25';
           setSpeedText(next);
          }}
         >
          {speedText} mm/s
         </button>
        </div>

        <div className="cal-nudge-group">
         <button className="cal-mini-btn" title="Achicar escala" onClick={()=>nudge(.98)}>−2%</button>
         <button className="cal-mini-btn" title="Agrandar escala" onClick={()=>nudge(1.02)}>+2%</button>
        </div>
       </div>

       <div className="cal-action-row">
        <Button className="cal-text-btn cancel" onPress={cancelCalibration}>Cancelar</Button>
        <div className="cal-scale-info">
         <span>X: {state.calibration.sx.toFixed(2)}</span>
         <span>Y: {state.calibration.sy.toFixed(2)}</span>
        </div>
        <label className="cal-opacity-label">
         <span>Opacidad</span>
         <input type="range" min=".1" max=".9" step=".02" value={opacity} onChange={e=>setOpacity(+e.target.value)}/>
        </label>
        <Button className="cal-done-btn" onPress={applyCalibration}>✓ Listo</Button>
       </div>
      </nav>
     )}

     {/* 3. MEASURE DOCK (Transforms smoothly into Measurement Controls) */}
     {activeBar==='measure'&&(
      <div className="measure-dock-container">

       {/* Floating Measurement HUD when a caliper is selected */}
       {m&&(
        <div className="measure-hud glass">
         <div className="hud-header">
          <strong className="hud-title">{summary(m,state.calibration,formula)}</strong>
          {m.kind==='QT'&&(
           <select className="hud-select" value={formula} onChange={e=>setFormula(e.target.value as Formula)}>
            {formulas.map(f=><option key={f} value={f}>{f}</option>)}
           </select>
          )}
          <button className="hud-trash-btn" title="Eliminar medida" onClick={()=>{commit(s=>({...s,measures:s.measures.filter(x=>x.id!==m.id)}));setSelected(null);}}>
           <Icon name="trash"/>
          </button>
         </div>

         {/* Step adjustment & QT specific tools */}
         <div className="hud-actions">
          <div className="nudge-cluster">
           <span className="nudge-title">Ajuste fino:</span>
           <button className="nudge-btn" title="Mover 1ms a la izquierda" onClick={()=>nudgeMeasure(-1)}>◀ 1ms</button>
           <button className="nudge-btn" title="Mover 1ms a la derecha" onClick={()=>nudgeMeasure(1)}>1ms ▶</button>
           <button className="nudge-btn end" title="Ajustar extremo derecho -1ms" onClick={()=>nudgeMeasureEnd(-1)}>−1ms fin</button>
           <button className="nudge-btn end" title="Ajustar extremo derecho +1ms" onClick={()=>nudgeMeasureEnd(1)}>+1ms fin</button>
          </div>

          {m.kind==='QT'&&(
           <div className="qt-actions">
            <button className={'qt-chip '+(tool==='current'?'active':'')} onClick={()=>{setTool('current');notify('Tocá el pico R del complejo cuyo QT estás midiendo.');}}>
             R del QT
            </button>
            <button className={'qt-chip '+(tool==='previous'?'active':'')} onClick={()=>{setTool('previous');notify('Tocá el pico R anterior.');}}>
             R anterior
            </button>
            {!m.tangent?(
             <button className="qt-chip" onClick={tangent}>+ Tangente T</button>
            ):(
             <button className="qt-chip active" onClick={()=>updateMeasure(mm=>{delete mm.tangent;})}>QT directo</button>
            )}
           </div>
          )}

          {m.kind==='RR'&&(
           <button className={'qt-chip '+(m.projection?'active':'')} onClick={()=>updateMeasure(mm=>{mm.projection=!mm.projection;})}>
            {m.projection?'Proyección activa':'Activar proyección'}
           </button>
          )}
         </div>

         {m.tangent&&(
          <div className="tangent-slider-row">
           <span>Ángulo {(Math.atan2(m.tangent.b.y-m.tangent.a.y,m.tangent.b.x-m.tangent.a.x)*180/Math.PI).toFixed(1)}°</span>
           <input type="range" min="-179" max="179" step=".5" value={Math.atan2(m.tangent.b.y-m.tangent.a.y,m.tangent.b.x-m.tangent.a.x)*180/Math.PI} onChange={e=>angleChange(+e.target.value)}/>
          </div>
         )}
        </div>
       )}

       {/* Bottom Measurement Selector Bar */}
       <nav className="dock-measure-bar glass" aria-label="Opciones de medición">
        <div className="measure-kind-selector">
         {(['PR','QRS','QT','RR'] as Kind[]).map(k=>(
          <Button key={k} className={'kind-btn '+(tool===k?'active':'')} onPress={()=>chooseTool(k)}>
           {k}
          </Button>
         ))}
        </div>

        <Button className="measure-done-btn" onPress={()=>{setTool('move');setSelected(null);setActiveBar('main');}}>
         ✓ Listo
        </Button>
       </nav>
      </div>
     )}

    </div>
   )}

   {/* MODAL BOTTOM SHEETS (Document, Export, Records, Options) */}
   {modal&&(
    <div className="modal-backdrop" onClick={()=>setModal(null)}>
     <section className="modal-sheet glass" onClick={e=>e.stopPropagation()}>
      <div className="sheet-header">
       <strong>
        {modal==='file'?'Documento y Páginas':modal==='export'?'Guardar y Exportar':modal==='records'?'Registros de Medidas':'Opciones'}
       </strong>
       <button className="sheet-close" onClick={()=>setModal(null)}>✕</button>
      </div>

      <div className="sheet-content">
       {modal==='file'&&(
        <>
         <Button className="sheet-btn" onPress={()=>fileInput.current?.click()}>📁 Abrir imagen o archivo PDF</Button>
         <Button className="sheet-btn" onPress={()=>sessionInput.current?.click()}>📥 Abrir sesión guardada (.json)</Button>
         <Button className="sheet-btn" onPress={()=>void restoreLocal()}>🔄 Recuperar sesión de este navegador</Button>
         {doc&&doc.pages>1&&(
          <div className="sheet-pagination">
           <span>Página {doc.page} de {doc.pages}</span>
           <div className="sheet-btn-row">
            <Button className="sheet-mini-btn" isDisabled={doc.page<=1||busy} onPress={()=>void page(-1)}>← Anterior</Button>
            <Button className="sheet-mini-btn" isDisabled={doc.page>=doc.pages||busy} onPress={()=>void page(1)}>Siguiente →</Button>
           </div>
          </div>
         )}
        </>
       )}

       {modal==='export'&&(
        <>
         <Button className="sheet-btn" isDisabled={!doc||busy} onPress={()=>void saveSession(false)}>Descargar sesión JSON (editable)</Button>
         <Button className="sheet-btn" isDisabled={!doc||busy} onPress={()=>void saveSession(true)}>Guardar sesión en este navegador (IndexedDB)</Button>
         <Button className="sheet-btn" isDisabled={!doc} onPress={csv}>📊 Exportar medidas en CSV</Button>
        </>
       )}

       {modal==='records'&&(
        <>
         {!state.measures.length?(
          <p className="sheet-empty">No hay medidas registradas todavía.<br/>Tocá "Medir" para agregar una.</p>
         ):(
          <div className="records-list">
           {state.measures.map((mm,i)=>(
            <button key={mm.id} className="record-item" onClick={()=>{setSelected(mm.id);setActiveBar('measure');setTool('move');setModal(null);}}>
             <span className="rec-num">{String(i+1).padStart(2,'0')}</span>
             <div className="rec-info">
              <span className="rec-summary">{summary(mm,state.calibration,formula)}</span>
              <small className="rec-details">{mm.tangent?'Método Tangente':'Calibre directo'}{mm.kind==='QT'?' · '+formula:''}</small>
             </div>
             <span className="rec-arrow">›</span>
            </button>
           ))}
          </div>
         )}
        </>
       )}

       {modal==='options'&&(
        <>
         <Button className="sheet-btn" onPress={()=>setGridVisible(!gridVisible)}>
          {gridVisible?'Ocultar':'Mostrar'} grilla de verificación milimétrica
         </Button>
         <Button className="sheet-btn danger" onPress={()=>{if(confirm('¿Borrar la sesión guardada en este navegador?'))void clearLocal().then(()=>{notify('Sesión local eliminada.');setModal(null);}).catch(()=>notify('No se pudo borrar.'));}}>
          Eliminar sesión guardada localmente
         </Button>
        </>
       )}
      </div>
     </section>
    </div>
   )}

  </main>
 );
}
