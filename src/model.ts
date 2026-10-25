export type Point = {x:number;y:number};
/** sx/sy: unidades del documento por mm. gain: mm/mV impresos (10 si no se indica). */
export type Calibration = {sx:number;sy:number;x:number;y:number;speed:number;confirmed:boolean;gain?:number};
export type Kind = 'PR'|'QRS'|'QT'|'RR';
export type Formula = 'Bazett'|'Fridericia'|'Framingham'|'Hodges';
export type Axis = 'x'|'y'|'both';
/** Calibre. y es la barra horizontal; en RR, top/bottom (coordenadas del documento) extienden las mordazas para medir amplitud. */
export type Measure = {id:string;kind:Kind;x1:number;x2:number;y:number;projection:boolean;rrPrevious?:number;rrCurrent?:number;tangent?:{a:Point;b:Point;base:number};top?:number;bottom?:number};
export type State = {calibration:Calibration;measures:Measure[]};
export const initialCalibration=():Calibration=>({sx:8,sy:8,x:0,y:0,speed:25,confirmed:false});
export const MIN=0.0001,MAX=100000;
export const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
export function validCalibration(c:Calibration){return [c.sx,c.sy,c.x,c.y,c.speed].every(Number.isFinite)&&c.sx>=MIN&&c.sy>=MIN&&c.sx<=MAX&&c.sy<=MAX&&c.speed>0&&c.speed<=1000;}
export function scaled(g:Calibration,ratio:number,m0:Point,m1:Point,axis:Axis):Calibration {
 let sx=g.sx,sy=g.sy;
 if(axis==='both'){const r=clamp(ratio,Math.max(MIN/sx,MIN/sy),Math.min(MAX/sx,MAX/sy));sx*=r;sy*=r;}
 else if(axis==='x')sx=clamp(sx*ratio,MIN,MAX);else sy=clamp(sy*ratio,MIN,MAX);
 return {...g,sx,sy,x:m1.x-(m0.x-g.x)*(sx/g.sx),y:m1.y-(m0.y-g.y)*(sy/g.sy)};
}
export const DEFAULT_GAIN=10;
export const gainOf=(c:Calibration)=>c.gain!==undefined&&Number.isFinite(c.gain)&&c.gain>0&&c.gain<=1000?c.gain:DEFAULT_GAIN;
/** Ganancia impresa («10 mm/mV», «5,0 mm / mV»). */
export function parseGain(text:string):number|null{
 const m=/(\d+(?:[.,]\d+)?)\s*mm\s*\/\s*mV\b/i.exec(text);
 const v=m?Number(m[1].replace(',','.')):NaN;
 return Number.isFinite(v)&&v>0&&v<=1000?v:null;
}
export function timeMS(distance:number,c:Calibration):number|null {return c.confirmed&&validCalibration(c)?Math.abs(distance)/c.sx/c.speed*1000:null;}
export function intersection(m:Measure):number|null {
 if(!m.tangent)return m.x2;
 const {a,b,base}=m.tangent,dy=b.y-a.y;
 if(Math.abs(dy)<1e-8*Math.max(1,Math.hypot(b.x-a.x,dy)))return null;
 const x=a.x+(base-a.y)*(b.x-a.x)/dy;
 return Number.isFinite(x)?x:null;
}
export function duration(m:Measure,c:Calibration):number|null {
 const end=intersection(m);if(end===null||m.kind==='QT'&&end<=m.x1)return null;
 return timeMS(end-m.x1,c);
}
export function previousRR(m:Measure,c:Calibration):number|null {
 if(m.kind!=='QT'||m.rrPrevious===undefined||m.rrCurrent===undefined||m.rrCurrent<=m.rrPrevious)return null;
 const end=intersection(m);
 // The current R must be within the selected QRS-to-T interval, not in another beat.
 if(end===null||m.rrCurrent<m.x1||m.rrCurrent>end)return null;
 return timeMS(m.rrCurrent-m.rrPrevious,c);
}
export function corrected(qt:number,rr:number,f:Formula):number|null {
 if(!Number.isFinite(qt)||!Number.isFinite(rr)||qt<=0||rr<=0)return null;
 const s=rr/1000;
 switch(f){case 'Bazett':return qt/Math.sqrt(s);case 'Fridericia':return qt/Math.cbrt(s);case 'Framingham':return qt+154*(1-s);case 'Hodges':return qt+1.75*(60/s-60);}
}
export function positions(start:number,step:number,width:number):number[]{
 step=Math.abs(step);if(!Number.isFinite(step)||step<=0||!Number.isFinite(start))return [];
 const lo=Math.ceil(-start/step),hi=Math.floor((width-start)/step);
 if(hi<lo||hi-lo>1500)return [];
 return Array.from({length:hi-lo+1},(_,i)=>start+(lo+i)*step);
}
/** Traslada el calibre completo (mordazas, barra, extensión vertical, tangente y referencias R). */
export function translate(m:Measure,dx:number,dy:number):void{
 m.x1+=dx;m.x2+=dx;m.y+=dy;
 if(m.top!==undefined)m.top+=dy;
 if(m.bottom!==undefined)m.bottom+=dy;
 if(m.tangent){m.tangent.a.x+=dx;m.tangent.b.x+=dx;m.tangent.a.y+=dy;m.tangent.b.y+=dy;m.tangent.base+=dy;}
 if(m.rrPrevious!==undefined)m.rrPrevious+=dx;
 if(m.rrCurrent!==undefined)m.rrCurrent+=dx;
}
/**
 * Extiende la mordaza superior o inferior de un calibre hasta y. Nunca cruza la barra:
 * si queda a menos de `min` unidades de ella, la extensión se retira.
 */
export function setEdge(m:Measure,edge:'top'|'bottom',y:number,min=0):void{
 if(!Number.isFinite(y))return;
 const d=edge==='top'?m.y-y:y-m.y;
 if(d<=Math.max(0,min))delete m[edge];else m[edge]=y;
}
/** Quita extensiones inválidas (no numéricas o del lado equivocado). */
export function normalizeMeasure(m:Measure):Measure{
 if(m.top!==undefined&&!(Number.isFinite(m.top)&&m.top<m.y))delete m.top;
 if(m.bottom!==undefined&&!(Number.isFinite(m.bottom)&&m.bottom>m.y))delete m.bottom;
 return m;
}
/** Distancia vertical medida (unidades del documento): de la mordaza superior a la inferior, o a la barra si solo hay una. */
export function amplitudeUnits(m:Measure):number|null{
 if(m.top===undefined&&m.bottom===undefined)return null;
 const d=(m.bottom??m.y)-(m.top??m.y);
 return Number.isFinite(d)&&d>0?d:null;
}
export function amplitudeMM(m:Measure,c:Calibration):number|null{
 const u=amplitudeUnits(m);
 return u!==null&&c.confirmed&&validCalibration(c)?u/c.sy:null;
}
export function amplitudeMV(m:Measure,c:Calibration):number|null{
 const mm=amplitudeMM(m,c);return mm===null?null:mm/gainOf(c);
}
/** Número con coma decimal (español). */
export const num=(n:number,d=0)=>n.toFixed(d).replace('.',',');
export type Readout={kind:Kind;value:string|null;hint:string|null;secondary:string|null;amplitude:string|null;qtc:string|null};
export function readout(m:Measure,c:Calibration,f:Formula):Readout{
 const t=duration(m,c),mm=amplitudeMM(m,c),mv=amplitudeMV(m,c);
 const amplitude=mm===null||mv===null?null:`${num(mm,1)} mm · ${num(mv,2)} mV`;
 if(t===null)return {kind:m.kind,value:null,hint:c.confirmed?'revisar referencias':'sin calibrar',secondary:null,amplitude,qtc:null};
 let secondary:string|null=null;
 if(m.kind==='RR'&&t>0)secondary=`${num(60000/t)} lpm`;
 let qtc:string|null=null;
 if(m.kind==='QT'){const r=previousRR(m,c),q=r===null?null:corrected(t,r,f);qtc=q===null?null:num(q);secondary=q===null?'QTc —':`QTc ${qtc} ms`;}
 return {kind:m.kind,value:num(t),hint:null,secondary,amplitude,qtc};
}
/** Avance de un QT hacia su QTc: 0 sin referencias R, 1 con una, 2 con las dos (QTc calculable). */
export function qtStage(m:Measure,c:Calibration):0|1|2{
 if(previousRR(m,c)!==null)return 2;
 return m.rrPrevious!==undefined||m.rrCurrent!==undefined?1:0;
}
export function summary(m:Measure,c:Calibration,f:Formula):string {
 const r=readout(m,c,f);
 return [r.value===null?`${m.kind} · ${r.hint}`:`${m.kind} ${r.value} ms`,r.secondary,r.amplitude].filter(Boolean).join(' · ');
}
export const FORMULAS:Formula[]=['Bazett','Fridericia','Framingham','Hodges'];
/** CSV de medidas: valores numéricos con punto decimal, sin redondear. */
export function measuresCSV(s:State):string{
 const c=s.calibration;
 const rows=[['tipo','inicio_u','fin_u','intervalo_ms','RR_previo_ms',...FORMULAS,'amplitud_mm','amplitud_mV','metodo'],...s.measures.map(m=>{
  const t=duration(m,c),r=previousRR(m,c);
  return [m.kind,m.x1,intersection(m)??'',t??'',r??'',...FORMULAS.map(f=>m.kind==='QT'&&t!==null&&r!==null?corrected(t,r,f)??'':''),amplitudeMM(m,c)??'',amplitudeMV(m,c)??'',m.tangent?'tangente':'directo'];
 })];
 const escape=(x:unknown)=>'"'+String(x).replaceAll('"','""')+'"';
 return `# Medidas ECG Web\n# Velocidad mm/s,${c.speed}\n# Ganancia mm/mV,${gainOf(c)}\n# Escala X,${c.sx}\n# Escala Y,${c.sy}\n`+rows.map(r=>r.map(escape).join(',')).join('\n');
}

/* Calibración por 4 puntos: el cuadrado de SQUARE_MM del papel se marca en sentido horario desde arriba a la izquierda. */
export const SQUARE_MM=25;
export type Mat=number[];
export function homography(src:Point[],dst:Point[]):Mat|null{
 if(src.length!==4||dst.length!==4)return null;
 const a:number[][]=[];
 for(let i=0;i<4;i++){
  const {x,y}=src[i],{x:u,y:v}=dst[i];
  a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]);
 }
 for(let c=0;c<8;c++){
  let p=c;for(let r=c+1;r<8;r++)if(Math.abs(a[r][c])>Math.abs(a[p][c]))p=r;
  if(Math.abs(a[p][c])<1e-12)return null;
  [a[c],a[p]]=[a[p],a[c]];
  for(let r=0;r<8;r++){if(r===c)continue;const f=a[r][c]/a[c][c];for(let k=c;k<9;k++)a[r][k]-=f*a[c][k];}
 }
 const h=a.map((r,i)=>r[8]/r[i]);
 return h.every(Number.isFinite)?[...h,1]:null;
}
export function applyH(h:Mat,p:Point):Point|null{
 const w=h[6]*p.x+h[7]*p.y+h[8];
 if(!Number.isFinite(w)||Math.abs(w)<1e-12)return null;
 return {x:(h[0]*p.x+h[1]*p.y+h[2])/w,y:(h[3]*p.x+h[4]*p.y+h[5])/w};
}
export function invertH(h:Mat):Mat|null{
 const [a,b,c,d,e,f,g,i,j]=h,A=e*j-f*i,B=c*i-b*j,C=b*f-c*e,det=a*A+d*B+g*C;
 if(!Number.isFinite(det)||Math.abs(det)<1e-18)return null;
 return [A,B,C,f*g-d*j,a*j-c*g,c*d-a*f,d*i-e*g,b*g-a*i,a*e-b*d].map(v=>v/det);
}
const signedArea=(q:Point[])=>q.reduce((s,p,i)=>{const n=q[(i+1)%q.length];return s+p.x*n.y-n.x*p.y;},0)/2;
/** Si se marcó en sentido antihorario se intercambian el 2.º y el 4.º para conservar arriba-izquierda como origen. */
export function orderQuad(q:Point[]):Point[]{return q.length===4&&signedArea(q)<0?[q[0],q[3],q[2],q[1]]:q;}
export function quadProblem(q:Point[]):string|null{
 if(q.length!==4)return 'Faltan puntos.';
 for(let i=0;i<4;i++){
  const a=q[i],b=q[(i+1)%4],c=q[(i+2)%4];
  if(Math.hypot(b.x-a.x,b.y-a.y)<8)return 'Dos esquinas están casi en el mismo lugar.';
  if(((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<=0)return 'Las esquinas no forman un cuadrilátero convexo: revisá el orden.';
 }
 return null;
}
const side=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y);
/** Cuadrado ya recto en la imagen: no hace falta enderezar, basta una escala por eje. */
export function axisAligned(q:Point[],tol=.004):boolean{
 if(q.length!==4)return false;
 const [p1,p2,p3,p4]=q,top=side(p1,p2),bottom=side(p4,p3),left=side(p1,p4),right=side(p2,p3);
 const flat=(a:Point,b:Point)=>b.x-a.x>0&&Math.abs(b.y-a.y)<=tol*(b.x-a.x);
 const upright=(a:Point,b:Point)=>b.y-a.y>0&&Math.abs(b.x-a.x)<=tol*(b.y-a.y);
 return flat(p1,p2)&&flat(p4,p3)&&upright(p1,p4)&&upright(p2,p3)&&Math.abs(top-bottom)<=tol*top&&Math.abs(left-right)<=tol*left;
}
/** Escala por eje de un rectángulo recto de w × h mm (un cuadrado si no se indica h). */
export function quadCalibration(q:Point[],w:number,speed:number,h=w):Calibration{
 const [p1,p2,p3,p4]=q;
 return {sx:(side(p1,p2)+side(p4,p3))/2/w,sy:(side(p1,p4)+side(p2,p3))/2/h,x:p1.x,y:p1.y,speed,confirmed:true};
}
/** Homografía del plano del papel (mm, origen en la esquina 1) a la imagen, para un rectángulo de w × h mm. */
export function paperToImage(q:Point[],w:number,h=w):Mat|null{
 return homography([{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}],q);
}
