import {detectGrid,type Detection} from './gridfinder';
import type {DocumentData} from './documents';
import type {Sampler} from './snap';

const MAX_SIDE=900;
const detections=new WeakMap<DocumentData,Promise<Detection|null>>();
const images=new WeakMap<DocumentData,Promise<HTMLImageElement>>();

function image(doc:DocumentData):Promise<HTMLImageElement>{
 let p=images.get(doc);
 if(!p){
  p=(async()=>{const im=new Image();im.src=doc.url;await im.decode();return im;})();
  p.catch(()=>images.delete(doc));
  images.set(doc,p);
 }
 return p;
}

/** Busca la grilla en una imagen (no en PDF: allí se calibra por vectores). Las esquinas salen en unidades del documento.
    El resultado se recuerda por documento: abrir y luego tocar Calibrar no repite la búsqueda. */
export function detectDocument(doc:DocumentData):Promise<Detection|null>{
 if(doc.kind!=='image')return Promise.resolve(null);
 let p=detections.get(doc);
 if(!p){
  p=(async()=>{
   const im=await image(doc);
   const s=Math.min(1,MAX_SIDE/Math.max(im.naturalWidth,im.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(im.naturalWidth*s));canvas.height=Math.max(1,Math.round(im.naturalHeight*s));
   const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
   ctx.drawImage(im,0,0,canvas.width,canvas.height);
   const data=ctx.getImageData(0,0,canvas.width,canvas.height);
   return detectGrid(data,doc.width/canvas.width);
  })();
  p.catch(()=>detections.delete(doc));
  detections.set(doc,p);
 }
 return p;
}

/** Recortes de la imagen original a resolución completa (unidades del documento = píxeles); null en PDF. */
export async function documentSampler(doc:DocumentData):Promise<Sampler|null>{
 if(doc.kind!=='image')return null;
 const im=await image(doc),W=im.naturalWidth,H=im.naturalHeight;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 return (x0,y0,w,h)=>{
  const xa=Math.max(0,x0),ya=Math.max(0,y0),xb=Math.min(W,x0+w),yb=Math.min(H,y0+h);
  if(xb-xa<4||yb-ya<4)return null;
  if(canvas.width<xb-xa||canvas.height<yb-ya){canvas.width=Math.max(canvas.width,xb-xa);canvas.height=Math.max(canvas.height,yb-ya);}
  ctx.clearRect(0,0,xb-xa,yb-ya);
  ctx.drawImage(im,xa,ya,xb-xa,yb-ya,0,0,xb-xa,yb-ya);
  return {img:ctx.getImageData(0,0,xb-xa,yb-ya),x0:xa,y0:ya};
 };
}
