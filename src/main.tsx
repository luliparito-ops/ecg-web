import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';
/* El único zoom es el del lienzo: se anula el del navegador (pellizco en Safari, Ctrl/⌘+rueda, Ctrl/⌘ +/−/0). */
const stop=(e:Event)=>e.preventDefault();
for(const t of ['gesturestart','gesturechange','gestureend'])document.addEventListener(t,stop);
document.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)e.preventDefault();},{passive:false});
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&['+','-','=','_','0'].includes(e.key))e.preventDefault();});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
