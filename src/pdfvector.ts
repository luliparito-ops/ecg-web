import {OPS} from 'pdfjs-dist';
import type {DocumentData} from './documents';

/** Un punto del PDF (1/72 in) en milímetros: la escala física del papel. */
export const PT_PER_MM=72/25.4;
const MAX_OPS=600_000;

export function parseSpeed(text:string):number|null{
 const m=/(\d+(?:[.,]\d+)?)\s*mm\s*\/\s*s\b/i.exec(text);
 const v=m?Number(m[1].replace(',','.')):NaN;
 return Number.isFinite(v)&&v>0&&v<=1000?v:null;
}

/** Paso más frecuente entre posiciones de una retícula (null si no hay una clara). */
export function latticePitch(values:number[]):number|null{
 const u=[...new Set(values.map(v=>Math.round(v*100)/100))].sort((a,b)=>a-b);
 const counts=new Map<number,number>();
 for(let i=1;i<u.length;i++){const d=Math.round((u[i]-u[i-1])*100)/100;if(d>=1)counts.set(d,(counts.get(d)||0)+1);}
 let best=0,n=0;
 for(const [d,c] of counts)if(c>n){best=d;n=c;}
 return n>=20?best:null;
}

type M=number[];
const mul=(m:M,n:M):M=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];

/** Lee el texto y la retícula vectorial de la página (en puntos). */
export async function pageScale(doc:DocumentData):Promise<{speed:number|null;pitch:number|null}>{
 if(!doc.pdf)return {speed:null,pitch:null};
 const page=await doc.pdf.getPage(doc.page);
 const text=(await page.getTextContent()).items.map(t=>'str' in t?t.str:'').join(' ');
 const speed=parseSpeed(text);
 const list=await page.getOperatorList();
 if(list.fnArray.length>MAX_OPS)return {speed,pitch:null};
 let ctm:M=[1,0,0,1,0,0];const stack:M[]=[],xs:number[]=[];
 for(let i=0;i<list.fnArray.length;i++){
  const op=list.fnArray[i],a=list.argsArray[i];
  if(op===OPS.save)stack.push([...ctm]);
  else if(op===OPS.restore)ctm=stack.pop()||ctm;
  else if(op===OPS.transform)ctm=mul(ctm,a as M);
  else if(op===OPS.constructPath){
   const ops=a[0] as ArrayLike<number>,co=a[1] as ArrayLike<number>;
   // Punto de la retícula: segmento de largo cero (trazo con extremo redondo) o línea vertical corta.
   if(ops.length===2&&co.length===4){
    const x1=ctm[0]*co[0]+ctm[2]*co[1]+ctm[4],y1=ctm[1]*co[0]+ctm[3]*co[1]+ctm[5];
    const x2=ctm[0]*co[2]+ctm[2]*co[3]+ctm[4],y2=ctm[1]*co[2]+ctm[3]*co[3]+ctm[5];
    if(Math.hypot(x2-x1,y2-y1)<1e-6)xs.push(x1);
   }
  }
 }
 return {speed,pitch:latticePitch(xs)};
}

/** Desvío relativo de una retícula de `pitch` pt respecto del milímetro físico (o de un múltiplo entero). */
export function gridDeviation(pitch:number):number|null{
 const r=pitch/PT_PER_MM,m=Math.round(r);
 return m>=1&&m<=10?r/m-1:null;
}
