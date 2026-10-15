import {useCallback,useEffect,useRef,useState} from 'react';
import {Button,Input,Label,TextField} from 'react-aria-components';
import Stage,{type Tool} from './Stage';
import Icon from './Icons';
import {loadDocument,fileToBase64,download,type DocumentData} from './documents';
import {copy,scaled,validCalibration,initialCalibration,summary,duration,previousRR,corrected,intersection,type State,type Axis,type Kind,type Formula,type Measure} from './model';
import {validateSession,sessionFile,type Session} from './session';
import {saveLocal,getLocal,clearLocal} from './storage';
type Panel='cal'|'measure'|'records'|'file'|'export'|'options'|null;
const formulas:Formula[]=['Bazett','Fridericia','Framingham','Hodges'];
const newState=():State=>({calibration:initialCalibration(),measures:[]});
export default function App(){
 const [doc,setDoc]=useState<DocumentData|null>(null),[state,setState]=useState<State>(newState),[selected,setSelected]=useState<string|null>(null),[tool,setTool]=useState<Tool>('move'),[panel,setPanel]=useState<Panel>(null),[axis,setAxis]=useState<Axis>('x'),[formula,setFormula]=useState<Formula>('Bazett'),[opacity,setOpacity]=useState(.55),[gridVisible,setGridVisible]=useState(false),[notice,setNotice]=useState('Abrí un ECG para comenzar.'),[busy,setBusy]=useState(false),[speedText,setSpeedText]=useState('25');
 const stateRef=useRef(state);stateRef.current=state;
 const docRef=useRef(doc);docRef.current=doc;
 const undoStack=useRef<State[]>([]),redoStack=useRef<State[]>([]),calSnapshot=useRef<State|null>(null),fileInput=useRef<HTMLInputElement>(null),sessionInput=useRef<HTMLInputElement>(null),noticeTimer=useRef<ReturnType<typeof setTimeout>>();
 const notify=useCallback((s:string)=>{setNotice(s);if(noticeTimer.current)clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),6500);},[]);
 useEffect(()=>()=>{if(noticeTimer.current)clearTimeout(noticeTimer.current);},[]);
 useEffect(()=>()=>{if(doc){URL.revokeObjectURL(doc.url);void doc.pdf?.destroy();}},[doc?.url]);
 function change(s:State){stateRef.current=s;setState(s);}
 function record(before:State){undoStack.current.push(copy(before));if(undoStack.current.length>80)undoStack.current.shift();redoStack.current=[];}
 function commit(fn:(s:State)=>State){record(stateRef.current);change(fn(copy(stateRef.current)));}
 const m=state.measures.find(m=>m.id===selected)||null;
 const calibrating=panel==='cal';
 function allowed(){if(calSnapshot.current){notify('Terminá o cancelá la calibración antes de cambiar de herramienta.');return false;}return true;}
 function openPanel(p:Panel){if(!allowed())return;setPanel(panel===p?null:p);}
 function beginCalibration(){if(!doc){notify('Primero abrí una imagen o un PDF.');return;}if(calSnapshot.current)return;calSnapshot.current=copy(stateRef.current);setAxis('x');setSpeedText(String(stateRef.current.calibration.speed));setTool('move');setPanel('cal');}
 function cancelCalibration(){if(calSnapshot.current){change(calSnapshot.current);calSnapshot.current=null;}setPanel(null);notify('Calibración anterior restaurada.');}
 function applyCalibration(){const speed=Number(speedText);if(!Number.isFinite(speed)||speed<=0||speed>1000){notify('Indicá una velocidad válida de este panel.');return;}const c={...stateRef.current.calibration,speed,confirmed:true};if(!validCalibration(c)){notify('Escala inválida.');return;}if(calSnapshot.current)record(calSnapshot.current);change({...stateRef.current,calibration:c});calSnapshot.current=null;setPanel(null);notify('Calibración aplicada. Verificá una distancia conocida; la coincidencia visual no certifica exactitud.');}
 function nudge(r:number){if(!doc)return;const p={x:doc.width/2,y:doc.height/2};change({...state,calibration:scaled(state.calibration,r,p,p,axis)});}
 function undo(){if(calSnapshot.current){cancelCalibration();return;}const prev=undoStack.current.pop();if(!prev){notify('Nada para deshacer.');return;}redoStack.current.push(copy(stateRef.current));change(prev);setSelected(null);}
 function redo(){if(!allowed())return;const next=redoStack.current.pop();if(next){undoStack.current.push(copy(stateRef.current));change(next);setSelected(null);}}
 function updateMeasure(fn:(m:Measure)=>void){if(!m)return;commit(s=>{const mm=s.measures.find(x=>x.id===m.id);if(mm)fn(mm);return s;});}
 function chooseTool(kind:Kind){if(!doc){notify('Abrí un documento.');return;}if(!state.calibration.confirmed){notify('Calibrá el tiempo antes de medir.');beginCalibration();return;}setTool(kind);setSelected(null);setPanel(null);notify(`Arrastrá horizontalmente para medir ${kind}. Dos dedos amplían el lienzo.`);}
 function selectMeasure(id:string|null){setSelected(id);if(id){setTool('move');setPanel('measure');}}
 async function openFile(file:File){if(!allowed())return;if((state.measures.length||state.calibration.confirmed)&&!window.confirm('Abrir otro documento reemplaza la calibración y medidas actuales. ¿Continuar?'))return;setBusy(true);try{const d=await loadDocument(file);setDoc(d);change(newState());setSelected(null);setTool('move');undoStack.current=[];redoStack.current=[];setPanel(null);notify('Documento abierto. Usá la regla inferior derecha para calibrar.');}catch(e){notify(e instanceof Error?e.message:'No se pudo abrir.');}finally{setBusy(false);}}
 async function page(delta:number){if(!doc?.pdf||!allowed())return;const n=doc.page+delta;if(n<1||n>doc.pages)return;if((state.measures.length||state.calibration.confirmed)&&!confirm('Cambiar de página elimina calibración y medidas activas. Guardá la sesión antes. ¿Continuar?'))return;setBusy(true);try{const pg=await doc.pdf.getPage(n),vp=pg.getViewport({scale:1});
 // Same PDF instance and URL are retained: avoid effect cleanup by reusing file ownership outside this page change.
 setDoc({...doc,page:n,width:vp.width,height:vp.height});change(newState());setSelected(null);undoStack.current=[];redoStack.current=[];notify('Nueva página: requiere su propia calibración.');}catch(e){notify(e instanceof Error?e.message:'Error de página.');}finally{setBusy(false);}}
 async function makeSession():Promise<Session>{if(!doc)throw Error('No hay documento.');return {format:'ecg-web-session',version:1,file:{name:doc.file.name,type:doc.file.type,data:await fileToBase64(doc.file)},page:doc.page,state:copy(stateRef.current),formula};}
 async function saveSession(local:boolean){if(!doc||!allowed())return;setBusy(true);try{const session=await makeSession();if(local){await saveLocal(session);notify('Sesión guardada en este navegador, incluyendo el documento.');}else{download('sesion-ecg.json',JSON.stringify(session),'application/json');notify('Sesión exportada; contiene el documento y puede incluir datos personales.');}}catch(e){notify(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}}
 async function restore(raw:unknown){if(!allowed())return;if(state.measures.length&&!confirm('¿Reemplazar la sesión actual?'))return;setBusy(true);let d:DocumentData|undefined;try{const s=validateSession(raw);d=await loadDocument(sessionFile(s));if(s.page>d.pages)throw Error('Página fuera del documento.');if(d.pdf){const pg=await d.pdf.getPage(s.page),vp=pg.getViewport({scale:1});d={...d,page:s.page,width:vp.width,height:vp.height};}setDoc(d);change(copy(s.state));setFormula(s.formula);setSelected(null);undoStack.current=[];redoStack.current=[];setTool('move');setPanel(null);notify('Sesión restaurada.');}catch(e){if(d){URL.revokeObjectURL(d.url);void d.pdf?.destroy();}notify(e instanceof Error?e.message:'No se pudo restaurar.');}finally{setBusy(false);}}
 async function restoreLocal(){try{const s=await getLocal();if(!s){notify('No hay sesión guardada en este navegador.');return;}await restore(s);}catch{notify('No se pudo leer el almacenamiento local.');}}
 function csv(){if(!doc||!allowed())return;const c=state.calibration;const rows=[['tipo','inicio_u','fin_u','intervalo_ms','RR_previo_ms',...formulas,'metodo'],...state.measures.map(m=>{const t=duration(m,c),r=previousRR(m,c);return [m.kind,m.x1,intersection(m)??'',t??'',r??'',...formulas.map(f=>m.kind==='QT'&&t!==null&&r!==null?corrected(t,r,f)??'':''),m.tangent?'tangente':'directo'];})];const escape=(x:unknown)=>'"'+String(x).replaceAll('"','""')+'"';download('medidas-ecg.csv',`# Beta no validada clínicamente\n# Velocidad mm/s,${c.speed}\n# Escala X,${c.sx}\n# Escala Y visual,${c.sy}\n`+rows.map(r=>r.map(escape).join(',')).join('\n'),'text/csv;charset=utf-8');notify('CSV exportado.');}
 function tangent(){if(!m||m.kind!=='QT')return;const w=Math.max(1,Math.abs(m.x2-m.x1));updateMeasure(x=>{x.tangent={a:{x:x.x2-w*.3,y:x.y-w*.25},b:{x:x.x2,y:x.y},base:x.y};});notify('Mové la recta en X/Y; sus extremos cambian inclinación. La base gris es independiente.');}
 function angleChange(degrees:number){if(!m?.tangent)return;const a=m.tangent.a,b=m.tangent.b,c={x:(a.x+b.x)/2,y:(a.y+b.y)/2},r=Math.hypot(b.x-a.x,b.y-a.y)/2,t=degrees*Math.PI/180;updateMeasure(mm=>{if(mm.tangent){mm.tangent.a={x:c.x-r*Math.cos(t),y:c.y-r*Math.sin(t)};mm.tangent.b={x:c.x+r*Math.cos(t),y:c.y+r*Math.sin(t)};}});}
 function exportNotice(){openPanel('export');}
 const button=(name:string,label:string,fn:()=>void,active=false)=><Button aria-label={label} className={'icon'+(active?' active':'')} onPress={fn} isDisabled={busy}><Icon name={name}/></Button>;
 return <main>
 {doc?<Stage doc={doc} state={state} tool={tool} calibrating={calibrating} axis={axis} selected={selected} formula={formula} gridVisible={gridVisible} opacity={opacity} onChange={change} onCommit={record} onSelect={selectMeasure} onNotice={notify}/>:<div className="empty"><div className="empty-mark"><Icon name="rr"/></div><h1>Tu ECG.<br/>Un lienzo preciso.</h1><p>Abrí una imagen o PDF.<br/>Los archivos se procesan en este navegador.</p><Button className="primary" onPress={()=>fileInput.current?.click()}>Abrir ECG</Button><button className="link" onClick={restoreLocal}>Recuperar sesión local</button><small>Beta · No validada clínicamente</small></div>}
 <input ref={fileInput} type="file" accept="image/*,application/pdf" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)void openFile(f);}}/>
 <input ref={sessionInput} type="file" accept="application/json,.json" hidden onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f){if(f.size>90_000_000){notify('Sesión demasiado grande.');return;}void f.text().then(t=>restore(JSON.parse(t))).catch(()=>notify('Archivo de sesión inválido.'));}}}/>
 <header className="top"><div className="glass capsule">{button('file','Cargar documento',()=>openPanel('file'))}</div><div className="right"><div className="glass capsule">{button('undo','Deshacer',undo)}</div><div className="glass capsule">{button('share','Exportar y guardar',exportNotice)}{button('more','Opciones',()=>openPanel('options'))}</div></div></header>
 {notice&&<div className="toast glass" role="status">{notice}</div>}
 {busy&&<div className="busy glass" role="status">Procesando…</div>}
 <nav className="bottom" aria-label="Herramientas"><div className="glass capsule">{button('records','Registros de medidas',()=>openPanel('records'),panel==='records')}{button('rr','Medir RR',()=>{if(!allowed())return;chooseTool('RR');},tool==='RR')}{button('pen','Medir PR, QRS o QT',()=>openPanel('measure'),panel==='measure')}</div><div className="glass capsule">{button('ruler','Calibrar',beginCalibration,calibrating)}</div></nav>
 {panel&&<section className="panel glass" aria-label={panel==='cal'?'Calibración':'Herramientas'}>
 <div className="row"><strong>{({cal:'Calibración · Holter',measure:'Medición',records:'Registros',file:'Documento',export:'Guardar y exportar',options:'Opciones'})[panel]}</strong>{panel==='cal'?<Button className="text yellow" onPress={applyCalibration}>Listo</Button>:<Button className="close" aria-label="Cerrar panel" onPress={()=>setPanel(null)}><Icon name="close"/></Button>}</div>
 {panel==='cal'&&<>
 <div className="segments">{([['both','Proporcional'],['x','Tiempo ↔'],['y','Altura ↕']] as const).map(([a,t])=><Button key={a} className={axis===a?'selected':''} onPress={()=>setAxis(a)}>{t}</Button>)}</div>
 <p className="sub">Un dedo: mover grilla. Dos dedos: ajustar {axis==='x'?'ancho':axis==='y'?'altura':'escala'} y posición. El ECG permanece fijo.</p>
 <TextField className="field" value={speedText} onChange={setSpeedText}><Label>Velocidad de este panel (mm/s)</Label><Input type="number" inputMode="decimal" min="0.01" step="any"/></TextField>
 <div className="legend"><span>1 mm</span><span>5 mm</span><span>25 mm</span></div>
 <div className="row"><Button className="chip" onPress={()=>nudge(.8)}>−20 %</Button><span className="sub mono">X {state.calibration.sx.toPrecision(4)} · Y {state.calibration.sy.toPrecision(4)}</span><Button className="chip" onPress={()=>nudge(1.25)}>+25 %</Button></div>
 <label className="slider"><span>Opacidad</span><input aria-label="Opacidad de grilla" type="range" min=".1" max=".9" step=".01" value={opacity} onChange={e=>setOpacity(+e.target.value)}/></label>
 <p className="sub">Las líneas demasiado juntas se ocultan, sin bloquear la escala. Altura es solo visual: no mide mV. Verificá líneas finas y mayores en varios sectores del mismo panel.</p>
 <div className="row"><Button className="text" onPress={cancelCalibration}>Cancelar</Button><Button className="text" onPress={()=>change({...state,calibration:{...initialCalibration(),speed:state.calibration.speed}})}>Restablecer grilla</Button></div>
 </>}
 {panel==='measure'&&<>
 <div className="segments">{(['PR','QRS','QT'] as Kind[]).map(k=><Button key={k} className={tool===k?'selected':''} onPress={()=>chooseTool(k)}>{k}</Button>)}</div>
 <p className="sub">Arrastrá para crear. Dos dedos: zoom y navegación. Seleccioná una medida para editar. Pulsación prolongada en un control: lupa.</p>
 {m&&<><div className="measure-value">{summary(m,state.calibration,formula)}</div><div className="row"><Button className="chip" onPress={()=>{setTool('move');setSelected(null);setPanel(null);}}>Terminar edición</Button><Button className="text danger" onPress={()=>{commit(s=>({...s,measures:s.measures.filter(x=>x.id!==m.id)}));setSelected(null);}}>Eliminar</Button></div>
 {m.kind==='RR'&&<Button className="chip" onPress={()=>updateMeasure(mm=>{mm.projection=!mm.projection;})}>Proyección: {m.projection?'activada':'oculta'}</Button>}
 {m.kind==='QT'&&<>
 <div className="rule"/><label className="field">Fórmula<select value={formula} onChange={e=>setFormula(e.target.value as Formula)}>{formulas.map(f=><option key={f}>{f}</option>)}</select></label>
 <div className="row"><Button className={'chip '+(tool==='current'?'selected':'')} onPress={()=>{setTool('current');setPanel(null);notify('Tocá la R del latido cuyo QT estás midiendo.');}}>R del QT</Button><Button className={'chip '+(tool==='previous'?'selected':'')} onPress={()=>{setTool('previous');setPanel(null);notify('Tocá la R inmediatamente anterior.');}}>R anterior</Button></div>
 <p className="sub">RR previo: {previousRR(m,state.calibration)?.toFixed(0)??'pendiente'} ms. La R actual debe estar dentro del QT. No se usa el calibre RR de regularidad.</p>
 {!m.tangent?<Button className="chip" onPress={tangent}>Añadir recta tangente</Button>:<>
 <div className="row"><span className="small">Tangente libre · X/Y</span><Button className="text" onPress={()=>updateMeasure(mm=>{delete mm.tangent;})}>QT directo</Button></div>
 <label className="slider"><span>Ángulo {(Math.atan2(m.tangent.b.y-m.tangent.a.y,m.tangent.b.x-m.tangent.a.x)*180/Math.PI).toFixed(1)}°</span><input aria-label="Ángulo de la tangente" type="range" min="-179" max="179" step=".25" value={Math.atan2(m.tangent.b.y-m.tangent.a.y,m.tangent.b.x-m.tangent.a.x)*180/Math.PI} onChange={e=>angleChange(+e.target.value)}/></label>
 <p className="sub">Arrastrá el cuerpo de la recta para mover X/Y; extremos para inclinar. La base gris se mueve por su control independiente. El cruce define el final de T.</p>
 </>}
 </>}
 </>}
 </>}
 {panel==='records'&&<>
 {!state.measures.length&&<p className="sub">Todavía no hay medidas.</p>}
 {state.measures.map((mm,i)=><Button key={mm.id} className="record" onPress={()=>{setSelected(mm.id);setTool('move');setPanel('measure');}}><span className="record-number">{String(i+1).padStart(2,'0')}</span><span>{summary(mm,state.calibration,formula)}<small>{mm.tangent?'Tangente':'Calibre directo'}{mm.kind==='QT'?' · '+formula:''}</small></span></Button>)}
 <p className="sub">Seleccioná un registro para editarlo. Las medidas no se guardan automáticamente al cerrar la página.</p>
 </>}
 {panel==='file'&&<>
 <Button className="wide" onPress={()=>fileInput.current?.click()}>Abrir imagen o PDF</Button>
 <Button className="wide" onPress={()=>sessionInput.current?.click()}>Abrir sesión guardada (.json)</Button>
 <Button className="wide" onPress={()=>void restoreLocal()}>Recuperar sesión de este navegador</Button>
 {doc&&<><div className="rule"/><p className="sub">{doc.kind==='pdf'?'PDF':'Imagen'} · Página {doc.page} de {doc.pages}</p>{doc.pages>1&&<div className="row"><Button className="chip" onPress={()=>void page(-1)} isDisabled={doc.page<=1||busy}>Anterior</Button><Button className="chip" onPress={()=>void page(1)} isDisabled={doc.page>=doc.pages||busy}>Siguiente</Button></div>}</>}
 <p className="sub">Una página activa por sesión. Cambiar página reinicia calibración y medidas; guardá antes de cambiar.</p>
 </>}
 {panel==='export'&&<>
 <Button className="wide" isDisabled={!doc||busy} onPress={()=>void saveSession(false)}>Descargar sesión editable</Button>
 <Button className="wide" isDisabled={!doc||busy} onPress={()=>void saveSession(true)}>Guardar sesión en este navegador</Button>
 <Button className="wide" isDisabled={!doc} onPress={csv}>Exportar medidas CSV</Button>
 <p className="sub">La sesión incluye el documento original: puede contener datos personales. El CSV incluye medidas y calibración. No se envían archivos a un servidor.</p>
 </>}
 {panel==='options'&&<>
 <Button className="wide" onPress={()=>{setTool('move');setSelected(null);setPanel(null);}}>Mover lienzo · sin crear medidas</Button>
 <Button className="wide" onPress={()=>setGridVisible(!gridVisible)}>{gridVisible?'Ocultar':'Mostrar'} grilla de verificación</Button>
 <Button className="wide" onPress={redo}>Rehacer</Button>
 <Button className="wide" onPress={()=>{if(confirm('¿Borrar la sesión almacenada en este navegador?'))void clearLocal().then(()=>notify('Sesión local eliminada.')).catch(()=>notify('No se pudo borrar.'));}}>Eliminar sesión local almacenada</Button>
 <p className="sub">Beta no validada clínicamente. Ampliar no recupera detalle ausente. No se corrige perspectiva. No se detectan latidos automáticamente. El panel y la miniatura del Holter no deben compartir escala sin verificarla.</p>
 </>}
 </section>}
 {doc&&!panel&&<div className="mode-badge">{tool==='move'?'Navegar · dos dedos para ampliar':tool==='current'?'Marcar R del QT':tool==='previous'?'Marcar R anterior':`${tool} · arrastrá para medir`}{!state.calibration.confirmed?' · Sin calibrar':''}</div>}
 </main>;
}
