import {useEffect,useRef,useState} from 'react';
import type {DocumentData} from './documents';
export default function PDFLayer({doc,scale,onError}:{doc:DocumentData;scale:number;onError:(s:string)=>void}){
 const holder=useRef(true),[renderScale,setRenderScale]=useState(scale),[url,setURL]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>setRenderScale(scale),220);return ()=>clearTimeout(timer);},[scale]);
 useEffect(()=>{
 if(!holder.current||!doc.pdf)return;
 let alive=true;let task:{cancel:()=>void}|undefined;
 void (async()=>{try{
 const pg=await doc.pdf!.getPage(doc.page);if(!alive)return;
 const target=Math.max(.2,Math.min(renderScale*(window.devicePixelRatio||1),4096/doc.width,4096/doc.height,Math.sqrt(12_000_000/(doc.width*doc.height))));
 const vp=pg.getViewport({scale:target}),canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);canvas.style.width='100%';canvas.style.height='100%';canvas.style.display='block';
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('No se pudo crear el lienzo PDF.');
 const render=pg.render({canvasContext:ctx,viewport:vp,background:'white'});task=render;await render.promise;
 if(alive)setURL(canvas.toDataURL('image/png'));
 }catch(e){if(alive&&!(e instanceof Error&&e.name==='RenderingCancelledException'))onError(e instanceof Error?e.message:'No se pudo renderizar PDF.');}})();
 return ()=>{alive=false;task?.cancel();};
 },[doc,renderScale,onError]);
 return url?<image href={url} width={doc.width} height={doc.height} pointerEvents="none"/>:null;
}
