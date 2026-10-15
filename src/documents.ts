import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy} from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerURL;
export type DocumentData={file:File;kind:'image'|'pdf';url:string;width:number;height:number;pages:number;pdf?:PDFDocumentProxy;page:number};
export async function loadDocument(file:File):Promise<DocumentData>{
 if(file.size>60*1024*1024)throw Error('Archivo mayor de 60 MB. Usá una página o recorte más pequeño.');
 const url=URL.createObjectURL(file);
 try{
 if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
 const pdf=await getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
 const pg=await pdf.getPage(1),vp=pg.getViewport({scale:1});
 return {file,kind:'pdf',url,width:vp.width,height:vp.height,pages:pdf.numPages,pdf,page:1};
 }
 const im=new Image();im.src=url;await im.decode();
 if(!im.naturalWidth||im.naturalWidth*im.naturalHeight>80_000_000)throw Error('Imagen demasiado grande (máximo 80 megapíxeles).');
 return {file,kind:'image',url,width:im.naturalWidth,height:im.naturalHeight,pages:1,page:1};
 }catch(e){URL.revokeObjectURL(url);throw e;}
}
export async function fileToBase64(file:File):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=reject;r.readAsDataURL(file);});}
export function download(name:string,data:string,type:string){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
