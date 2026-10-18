import {detectGrid,type Detection} from './gridfinder';
import type {DocumentData} from './documents';

const MAX_SIDE=900;

/** Busca la grilla en una imagen (no en PDF: allí se calibra por vectores). Las esquinas salen en unidades del documento. */
export async function detectDocument(doc:DocumentData):Promise<Detection|null>{
 if(doc.kind!=='image')return null;
 const im=new Image();im.src=doc.url;await im.decode();
 const s=Math.min(1,MAX_SIDE/Math.max(im.naturalWidth,im.naturalHeight));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(im.naturalWidth*s));canvas.height=Math.max(1,Math.round(im.naturalHeight*s));
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 ctx.drawImage(im,0,0,canvas.width,canvas.height);
 const data=ctx.getImageData(0,0,canvas.width,canvas.height);
 return detectGrid(data,doc.width/canvas.width);
}
