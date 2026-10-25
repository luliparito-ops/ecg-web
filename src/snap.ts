import type {Img} from './gridfinder';
import {applyH,homography,orderQuad,type Mat,type Point} from './model';

/** Ajuste fino de esquinas sobre la imagen a resolución completa: cada esquina va al cruce de líneas gruesas más marcado
    a menos de SEARCH mm, con precisión subpíxel. Después el rectángulo de referencia crece de a 5 mm mientras siga
    cayendo sobre líneas gruesas: la escala se mide sobre todo el papel visible y no solo sobre 25 mm. */

/** Recorte de la imagen: los píxeles de [x0,x0+ancho)×[y0,y0+alto). */
export type Crop={img:Img;x0:number;y0:number};
export type Sampler=(x0:number,y0:number,w:number,h:number)=>Crop|null;
export type Span={quad:Point[];w:number;h:number};

const SEARCH=1.2,ALONG=2.5,GAP=.6,STEP=.25,INK=110;
const MAX_W=300,MAX_H=200,MIN_STRENGTH=6,DOMINANCE=1.25;

/** Recorte de una imagen completa en memoria (pruebas, o una imagen ya rasterizada). */
export function imageSampler(img:Img):Sampler{
 return (x0,y0,w,h)=>{
  const xa=Math.max(0,x0),ya=Math.max(0,y0),xb=Math.min(img.width,x0+w),yb=Math.min(img.height,y0+h);
  if(xb-xa<4||yb-ya<4)return null;
  const W=xb-xa,H=yb-ya,data=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=((ya+y)*img.width+xa+x)*4,o=(y*W+x)*4;for(let c=0;c<4;c++)data[o+c]=img.data[i+c];}
  return {img:{data,width:W,height:H},x0:xa,y0:ya};
 };
}

type Field={v:Float32Array;W:number;H:number;x0:number;y0:number};

/** Oscuridad de la grilla por píxel; NaN en la tinta (traza, texto), que no es grilla. */
function field({img,x0,y0}:Crop,ppmm:number):Field{
 const {data,width:W,height:H}=img,n=W*H,mn=new Float32Array(n),ch=new Float32Array(n);
 let colored=0;
 for(let i=0;i<n;i++){
  const r=data[i*4],g=data[i*4+1],b=data[i*4+2],m=Math.min(r,g,b);
  mn[i]=m;ch[i]=Math.max(r,g,b)-m;
  if(ch[i]>=14&&m>=140)colored++;
 }
 // Con grilla de color la tinta es lo oscuro y poco saturado (también la traza sobre una línea rosa); sin color, lo muy oscuro.
 const chroma=colored>.003*n,ink=new Uint8Array(n),tmp=new Uint8Array(n),R=Math.max(1,Math.round(ppmm*.15));
 for(let i=0;i<n;i++)ink[i]=chroma?(mn[i]<228&&ch[i]<Math.max(9,.3*(255-mn[i]))?1:0):(mn[i]<INK?1:0);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let k=Math.max(0,x-R);k<=Math.min(W-1,x+R)&&!v;k++)v=ink[y*W+k];tmp[y*W+x]=v;}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let k=Math.max(0,y-R);k<=Math.min(H-1,y+R)&&!v;k++)v=tmp[k*W+x];ink[y*W+x]=v;}
 const v=new Float32Array(n);
 for(let i=0;i<n;i++)v[i]=ink[i]?NaN:255-mn[i];
 return {v,W,H,x0,y0};
}

/** Valor bilineal en coordenadas del documento (el píxel i cubre [i,i+1)). */
function at(f:Field,x:number,y:number):number{
 const px=x-f.x0-.5,py=y-f.y0-.5,i=Math.floor(px),j=Math.floor(py);
 if(i<0||j<0||i>=f.W-1||j>=f.H-1)return NaN;
 const fx=px-i,fy=py-j,o=j*f.W+i;
 return (f.v[o]*(1-fx)+f.v[o+1]*fx)*(1-fy)+(f.v[o+f.W]*(1-fx)+f.v[o+f.W+1]*fx)*fy;
}

/** Desplazamiento (px, sobre la normal de d) de la línea más marcada que pasa cerca de c con dirección d; null si no hay una clara. */
function lineOffset(f:Field,c:Point,d:Point,ppmm:number):number|null{
 const n={x:-d.y,y:d.x},K=Math.ceil(SEARCH*ppmm/STEP),L=ALONG*ppmm,G=GAP*ppmm,ds=Math.max(1,L/60);
 const P:number[]=[];
 for(let k=-K;k<=K;k++){
  const t=k*STEP;let s=0,cnt=0,all=0;
  for(let a=G;a<=L;a+=ds)for(const sg of [-1,1]){
   const v=at(f,c.x+t*n.x+sg*a*d.x,c.y+t*n.y+sg*a*d.y);all++;
   if(!Number.isNaN(v)){s+=v;cnt++;}
  }
  if(cnt<.3*all)return null;
  P.push(s/cnt);
 }
 const base=[...P].sort((a,b)=>a-b)[P.length>>1],w=Math.max(1,Math.round(.25*ppmm/STEP));
 const peaks:{k:number;s:number}[]=[];
 for(let k=w;k<P.length-w;k++){
  // Una meseta (línea alineada al píxel) cuenta como un solo pico: el primero de sus valores iguales.
  let top=true;for(let j=k-w;j<=k+w&&top;j++)if(j<k?P[j]>=P[k]:P[j]>P[k])top=false;
  if(top)peaks.push({k,s:P[k]-base});
 }
 peaks.sort((a,b)=>b.s-a.s);
 const best=peaks[0],rival=best&&peaks.find(p=>Math.abs(p.k-best.k)*STEP>.4*ppmm);
 if(!best||best.s<MIN_STRENGTH||rival&&best.s<DOMINANCE*rival.s)return null;
 // Centroide sobre la mitad superior del pico: subpíxel y sin sesgo con líneas antialias.
 const half=base+best.s/2;let lo=best.k,hi=best.k;
 while(lo>0&&P[lo-1]>half)lo--;
 while(hi<P.length-1&&P[hi+1]>half)hi++;
 let sw=0,st=0;for(let k=lo;k<=hi;k++){const q=P[k]-half;sw+=q;st+=q*(k-K)*STEP;}
 return sw>0?st/sw:null;
}

const unit=(v:Point)=>{const l=Math.hypot(v.x,v.y);return {x:v.x/l,y:v.y/l};};

/** Cruce de las dos líneas que pasan cerca de p con direcciones a y b (vectores de 1 mm). ok: cuántas de las dos se encontraron. */
export function refineAt(sample:Sampler,p:Point,a:Point,b:Point):{p:Point;ok:number}{
 const ppmm=(Math.hypot(a.x,a.y)+Math.hypot(b.x,b.y))/2;
 if(!(ppmm>=1.5)||!Number.isFinite(p.x)||!Number.isFinite(p.y))return {p,ok:0};
 const half=Math.ceil((ALONG+SEARCH+.5)*ppmm+3),crop=sample(Math.floor(p.x)-half,Math.floor(p.y)-half,2*half,2*half);
 if(!crop)return {p,ok:0};
 const f=field(crop,ppmm),da=unit(a),db=unit(b);
 const ta=lineOffset(f,p,da,ppmm),tb=lineOffset(f,p,db,ppmm);
 if(ta===null&&tb===null)return {p,ok:0};
 // Rectas n·x = n·p + t, con n la normal de cada dirección.
 const na={x:-da.y,y:da.x},nb={x:-db.y,y:db.x},ca=na.x*p.x+na.y*p.y+(ta??0),cb=nb.x*p.x+nb.y*p.y+(tb??0);
 const det=na.x*nb.y-na.y*nb.x;
 if(Math.abs(det)<.2)return {p,ok:0};
 const q={x:(ca*nb.y-cb*na.y)/det,y:(na.x*cb-nb.x*ca)/det};
 if(!(Math.hypot(q.x-p.x,q.y-p.y)<=1.5*SEARCH*ppmm))return {p,ok:0};
 return {p:q,ok:(ta===null?0:1)+(tb===null?0:1)};
}

/** Lleva las esquinas de un cuadrado de `mm` (en cualquier orden de marcado) a los cruces de líneas gruesas. only: ajustar solo esa esquina. */
export function snapQuad(sample:Sampler,quad:Point[],mm=25,only?:number):{quad:Point[];snapped:number}{
 if(quad.length!==4)return {quad,snapped:0};
 const ord=orderQuad(quad),idx=ord.map(p=>quad.indexOf(p));
 let cur=[...ord],snapped=0;
 for(let pass=0;pass<2;pass++){
  const next=[...cur];snapped=0;
  for(let i=0;i<4;i++){
   if(only!==undefined&&idx[i]!==only)continue;
   const p=cur[i],nx=cur[(i+1)%4],pv=cur[(i+3)%4];
   const dir=(q:Point)=>({x:(q.x-p.x)/mm,y:(q.y-p.y)/mm});
   const r=refineAt(sample,p,dir(nx),dir(pv));
   // Solo se mueve si encontró las dos líneas y no se aleja de lo marcado (el ajuste corrige, no reubica).
   if(r.ok===2&&Math.hypot(r.p.x-ord[i].x,r.p.y-ord[i].y)<=1.2*SEARCH*Math.hypot(nx.x-p.x,nx.y-p.y)/mm){next[i]=r.p;snapped++;}
  }
  cur=next;
 }
 const out=[...quad];
 for(let i=0;i<4;i++)out[idx[i]]=cur[i];
 return {quad:out,snapped};
}

/** Agranda el rectángulo de referencia de a 5 mm por lado mientras las esquinas nuevas caigan sobre cruces de líneas gruesas. */
export function grow(sample:Sampler,quad:Point[],mm=25):Span{
 if(quad.length!==4)return {quad,w:mm,h:mm};
 let x0=0,y0=0,x1=mm,y1=mm,q=orderQuad(quad);
 const rect=()=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
 let H:Mat|null=homography(rect(),q);
 if(!H)return {quad,w:mm,h:mm};
 const limit={r:false,l:false,b:false,t:false};
 const corner=(h:Mat,X:number,Y:number):Point|null=>{
  const p=applyH(h,{x:X,y:Y}),pa=applyH(h,{x:X+1,y:Y}),pb=applyH(h,{x:X,y:Y+1});
  if(!p||!pa||!pb)return null;
  const r=refineAt(sample,p,{x:pa.x-p.x,y:pa.y-p.y},{x:pb.x-p.x,y:pb.y-p.y});
  const ppmm=Math.hypot(pa.x-p.x,pa.y-p.y);
  return r.ok===2&&Math.hypot(r.p.x-p.x,r.p.y-p.y)<=.5*ppmm?r.p:null;
 };
 // Un lado que falla (esquina sobre la traza, texto o borde) se reintenta en la vuelta siguiente si otro lado creció:
 // sus esquinas ya son otras. Cada intento prueba 5 mm y, si no, 10 mm para saltar un obstáculo.
 for(let grew=true;grew;){
  grew=false;
  for(const side of ['r','l','b','t'] as const){
   if(limit[side]||!H)continue;
   const horiz=side==='r'||side==='l';
   let pts:(Point|null)[]=[null,null],X=0,Y=0;
   for(const step of [5,10]){
    if(horiz?x1-x0+step>MAX_W:y1-y0+step>MAX_H){if(step===5)limit[side]=true;break;}
    X=side==='r'?x1+step:side==='l'?x0-step:0;Y=side==='b'?y1+step:side==='t'?y0-step:0;
    pts=horiz?[corner(H,X,y0),corner(H,X,y1)]:[corner(H,x0,Y),corner(H,x1,Y)];
    if(pts[0]&&pts[1])break;
   }
   if(!pts[0]||!pts[1])continue;
   grew=true;
   const [a,b]=pts as Point[];
   if(side==='r'){x1=X;q=[q[0],a,b,q[3]];}
   else if(side==='l'){x0=X;q=[a,q[1],q[2],b];}
   else if(side==='b'){y1=Y;q=[q[0],q[1],b,a];}
   else{y0=Y;q=[a,b,q[2],q[3]];}
   H=homography(rect(),q);
   if(!H)return {quad:orderQuad(quad),w:mm,h:mm};
  }
 }
 return {quad:q,w:x1-x0,h:y1-y0};
}
