import type {Img} from './gridfinder';
import {homography,applyH,invertH,type Point} from './model';

/** Papel milimetrado analítico (líneas de 1 mm, gruesas cada 5 mm, más una traza) visto con la homografía `quad` (plano en mm → imagen). */
export function paper(W:number,H:number,quad:Point[],extent={w:150,h:100},thin=true,noise=0):{img:Img;toPlane:(p:Point)=>Point;toImage:(p:Point)=>Point}{
 const h=homography([{x:0,y:0},{x:extent.w,y:0},{x:extent.w,y:extent.h},{x:0,y:extent.h}],quad)!,inv=invertH(h)!;
 const data=new Uint8ClampedArray(W*H*4).fill(255);
 const plane=(x:number,y:number)=>applyH(inv,{x,y})!;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const p=plane(x+.5,y+.5),a=plane(x+1.5,y+.5),b=plane(x+.5,y+1.5),i=(y*W+x)*4;
  if(p.x<0||p.y<0||p.x>extent.w||p.y>extent.h){data[i]=data[i+1]=data[i+2]=60;continue;}
  const s=Math.sqrt(Math.abs((a.x-p.x)*(b.y-p.y)-(b.x-p.x)*(a.y-p.y)));
  const d1=Math.min(Math.abs(p.x-Math.round(p.x)),Math.abs(p.y-Math.round(p.y))),d5=Math.min(Math.abs(p.x-5*Math.round(p.x/5)),Math.abs(p.y-5*Math.round(p.y/5)));
  const a1=thin?Math.max(0,1-d1/s)*.55:0,a5=Math.max(0,1-d5/(1.3*s));
  const al=Math.max(a1,a5),col=a5>=a1?[219,166,176]:[239,203,208];
  let r=255*(1-al)+col[0]*al,g=255*(1-al)+col[1]*al,bl=255*(1-al)+col[2]*al;
  const ty=50+14*Math.sin(p.x*.6),dt=Math.abs(p.y-ty);
  if(dt<1.2*s){const t=1-dt/(1.2*s);r*=1-.8*t;g*=1-.8*t;bl*=1-.8*t;}
  if(noise){const n=((Math.sin(x*12.9898+y*78.233)*43758.5453)%1+1)%1*2-1;r+=n*noise;g+=n*noise*.8;bl+=n*noise*.9;}
  data[i]=r;data[i+1]=g;data[i+2]=bl;
 }
 return {img:{data,width:W,height:H},toPlane:p=>applyH(inv,p)!,toImage:p=>applyH(h,p)!};
}
