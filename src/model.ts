export type Point = {x:number;y:number};
export type Calibration = {sx:number;sy:number;x:number;y:number;speed:number;confirmed:boolean};
export type Kind = 'PR'|'QRS'|'QT'|'RR';
export type Formula = 'Bazett'|'Fridericia'|'Framingham'|'Hodges';
export type Axis = 'x'|'y'|'both';
export type Measure = {id:string;kind:Kind;x1:number;x2:number;y:number;projection:boolean;rrPrevious?:number;rrCurrent?:number;tangent?:{a:Point;b:Point;base:number}};
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
export function summary(m:Measure,c:Calibration,f:Formula):string {
 const t=duration(m,c);if(t===null)return `${m.kind} · ${c.confirmed?'revisar referencias':'sin calibrar'}`;
 if(m.kind==='RR')return `RR ${t.toFixed(0)} ms${t>0?' · '+(60000/t).toFixed(0)+' lpm':''}`;
 if(m.kind==='QT'){const r=previousRR(m,c),q=r===null?null:corrected(t,r,f);return `QT ${t.toFixed(0)} ms · ${q===null?'QTc pendiente':'QTc '+q.toFixed(0)+' ms'}`;}
 return `${m.kind} ${t.toFixed(0)} ms`;
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
export function quadCalibration(q:Point[],mm:number,speed:number):Calibration{
 const [p1,p2,p3,p4]=q;
 return {sx:(side(p1,p2)+side(p4,p3))/2/mm,sy:(side(p1,p4)+side(p2,p3))/2/mm,x:p1.x,y:p1.y,speed,confirmed:true};
}
/** Homografía del plano del papel (mm, origen en la esquina 1) a la imagen. */
export function paperToImage(q:Point[],mm:number):Mat|null{
 return homography([{x:0,y:0},{x:mm,y:0},{x:mm,y:mm},{x:0,y:mm}],q);
}
