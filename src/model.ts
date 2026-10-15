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
