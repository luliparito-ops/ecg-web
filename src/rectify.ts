import type {DocumentData} from './documents';
import {applyH,invertH,paperToImage,type Point} from './model';

const MAX_SIDE=4096,MAX_PIXELS=12_000_000,MAX_SOURCE=36_000_000;

async function raster(doc:DocumentData):Promise<{canvas:HTMLCanvasElement;s:number}>{
 const canvas=document.createElement('canvas');
 if(doc.kind==='pdf'&&doc.pdf){
  const page=await doc.pdf.getPage(doc.page),vp1=page.getViewport({scale:1});
  const s=Math.min(4,MAX_SIDE/Math.max(vp1.width,vp1.height)),vp=page.getViewport({scale:s});
  canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  await page.render({canvasContext:ctx,viewport:vp}).promise;
  return {canvas,s};
 }
 const im=new Image();im.src=doc.url;await im.decode();
 const s=Math.min(1,Math.sqrt(MAX_SOURCE/(im.naturalWidth*im.naturalHeight)));
 canvas.width=Math.round(im.naturalWidth*s);canvas.height=Math.round(im.naturalHeight*s);
 const ctx=canvas.getContext('2d')!;ctx.drawImage(im,0,0,canvas.width,canvas.height);
 return {canvas,s};
}

export type Rectified={doc:DocumentData;ppmm:number;origin:Point};

/** Endereza el documento para que el cuadrado marcado (quad, en unidades del documento) quede recto y de lado `mm`. */
export async function rectify(doc:DocumentData,quad:Point[],mm:number):Promise<Rectified>{
 const {canvas,s}=await raster(doc);
 const q=quad.map(p=>({x:p.x*s,y:p.y*s}));
 const h=paperToImage(q,mm),inv=h&&invertH(h);
 if(!h||!inv)throw Error('Las esquinas no permiten enderezar la imagen.');

 const edge=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y);
 let k=(edge(q[0],q[1])+edge(q[1],q[2])+edge(q[2],q[3])+edge(q[3],q[0]))/4/mm;

 // Extensión del papel visible: las cuatro esquinas de la imagen llevadas al plano en mm.
 const W=canvas.width,H=canvas.height;
 const corners=[{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}].map(p=>applyH(inv,p));
 const denom=[{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H}].map(p=>inv[6]*p.x+inv[7]*p.y+inv[8]);
 let minX=-60,minY=-60,maxX=mm+60,maxY=mm+60;
 if(corners.every(Boolean)&&(denom.every(d=>d>0)||denom.every(d=>d<0))){
  const xs=corners.map(c=>c!.x),ys=corners.map(c=>c!.y);
  minX=Math.min(...xs);maxX=Math.max(...xs);minY=Math.min(...ys);maxY=Math.max(...ys);
 }
 // La perspectiva estira el lado lejano: se limita la ventana a la extensión de la foto original alrededor del cuadrado.
 const cx=mm/2,cy=mm/2,hw=.9*W/k,hh=.9*H/k;
 minX=Math.max(minX,cx-hw);maxX=Math.min(maxX,cx+hw);minY=Math.max(minY,cy-hh);maxY=Math.min(maxY,cy+hh);
 const wmm=maxX-minX,hmm=maxY-minY;
 if(!(wmm>0&&hmm>0))throw Error('La perspectiva es demasiado extrema para enderezar.');
 k=Math.min(k,MAX_SIDE/wmm,MAX_SIDE/hmm,Math.sqrt(MAX_PIXELS/(wmm*hmm)));
 const ow=Math.max(1,Math.ceil(wmm*k)),oh=Math.max(1,Math.ceil(hmm*k));

 const src=canvas.getContext('2d')!.getImageData(0,0,W,H).data;
 const out=new ImageData(ow,oh),dst=out.data;
 for(let v=0;v<oh;v++){
  const Y=minY+(v+.5)/k;
  for(let u=0;u<ow;u++){
   const X=minX+(u+.5)/k,w=h[6]*X+h[7]*Y+h[8],o=(v*ow+u)*4;
   const sx=(h[0]*X+h[1]*Y+h[2])/w-.5,sy=(h[3]*X+h[4]*Y+h[5])/w-.5;
   if(!(sx>=-.5&&sy>=-.5&&sx<W-.5&&sy<H-.5)){dst[o]=dst[o+1]=dst[o+2]=255;dst[o+3]=255;continue;}
   const x0=Math.max(0,Math.floor(sx)),y0=Math.max(0,Math.floor(sy)),x1=Math.min(W-1,x0+1),y1=Math.min(H-1,y0+1);
   const fx=Math.min(1,Math.max(0,sx-x0)),fy=Math.min(1,Math.max(0,sy-y0));
   const a=(y0*W+x0)*4,b=(y0*W+x1)*4,c=(y1*W+x0)*4,d=(y1*W+x1)*4;
   for(let ch=0;ch<3;ch++)dst[o+ch]=(src[a+ch]*(1-fx)+src[b+ch]*fx)*(1-fy)+(src[c+ch]*(1-fx)+src[d+ch]*fx)*fy;
   dst[o+3]=255;
  }
 }
 const target=document.createElement('canvas');target.width=ow;target.height=oh;
 target.getContext('2d')!.putImageData(out,0,0);
 const blob=await new Promise<Blob|null>(r=>target.toBlob(r,'image/png'));
 if(!blob)throw Error('No se pudo generar la imagen enderezada.');
 const base=doc.original??doc;
 const url=URL.createObjectURL(blob);
 return {
  doc:{file:new File([blob],'ecg-enderezado.png',{type:'image/png'}),kind:'image',url,width:ow,height:oh,pages:1,page:1,original:base},
  ppmm:k,
  origin:{x:-minX*k,y:-minY*k}
 };
}
