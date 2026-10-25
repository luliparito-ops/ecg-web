import {describe,it,expect} from 'vitest';
import {detectGrid} from './gridfinder';
import {imageSampler,snapQuad,grow} from './snap';
import {axisAligned,quadCalibration,type Point} from './model';
import {paper} from './paper.fixture';

const straight:Point[]=[{x:60,y:40},{x:60+150*5,y:40},{x:60+150*5,y:40+100*5},{x:60,y:40+100*5}];
const persp:Point[]=[{x:100,y:60},{x:740,y:10},{x:780,y:520},{x:40,y:560}];
/** Distancia (mm) de un punto del plano al cruce de líneas gruesas más cercano. */
const offLattice=(p:Point)=>Math.hypot(p.x-5*Math.round(p.x/5),p.y-5*Math.round(p.y/5));
/** Cuadrado de 25 mm en el plano (esquina en x,y mm) llevado a la imagen, con un error de marcado de hasta `err` mm por esquina. */
function clicked(toImage:(p:Point)=>Point,x:number,y:number,err:number):Point[]{
 const jit=[[.9,-.6],[-.7,-.8],[.5,.95],[-.95,.4]];
 return [[0,0],[25,0],[25,25],[0,25]].map(([dx,dy],i)=>toImage({x:x+dx+jit[i][0]*err,y:y+dy+jit[i][1]*err}));
}

describe('Ajuste fino de esquinas',()=>{
 for(const [name,quad] of [['recta',straight],['perspectiva fuerte',persp]] as const)it(`lleva clics desviados 0,5 mm a los cruces: ${name}`,()=>{
  const {img,toPlane,toImage}=paper(800,600,quad),s=imageSampler(img);
  const q=clicked(toImage,40,30,.5),before=Math.max(...q.map(p=>offLattice(toPlane(p))));
  const r=snapQuad(s,q),after=Math.max(...r.quad.map(p=>offLattice(toPlane(p))));
  console.log(name,JSON.stringify({antes_mm:+before.toFixed(3),despues_mm:+after.toFixed(3),snapped:r.snapped}));
  expect(before).toBeGreaterThan(.5);
  expect(r.snapped).toBe(4);
  expect(after).toBeLessThan(.05);
 });

 for(const [name,quad] of [['recta',straight],['perspectiva fuerte',persp]] as const)it(`con un clic a 1 mm (sobre una línea fina) igual elige la gruesa: ${name}`,()=>{
  const {img,toPlane,toImage}=paper(800,600,quad),q=clicked(toImage,40,30,1.05);
  const r=snapQuad(imageSampler(img),q);
  expect(r.snapped).toBe(4);
  expect(Math.max(...r.quad.map(p=>offLattice(toPlane(p))))).toBeLessThan(.05);
 });

 it('lejos de una línea gruesa (2,5 mm) no se engancha a una fina',()=>{
  const {img,toPlane,toImage}=paper(800,600,straight),q=[{x:42.5,y:32.5},{x:67.5,y:32.5},{x:67.5,y:57.5},{x:42.5,y:57.5}].map(toImage);
  const r=snapQuad(imageSampler(img),q);
  for(const p of r.quad)expect(offLattice(toPlane(p))).toBeGreaterThan(2);
 });

 it('en una captura recta, el cuadrado ajustado queda recto (no se endereza la imagen ni se pierden medidas)',()=>{
  const {img,toImage}=paper(800,600,straight),q=clicked(toImage,40,30,.4);
  expect(axisAligned(q)).toBe(false);
  expect(axisAligned(snapQuad(imageSampler(img),q).quad)).toBe(true);
 });

 it('un clic que se reubica se respeta: solo se ajusta la esquina indicada',()=>{
  const {img,toImage}=paper(800,600,straight),q=clicked(toImage,40,30,.4),r=snapQuad(imageSampler(img),q,25,2);
  expect(r.quad[0]).toEqual(q[0]);expect(r.quad[1]).toEqual(q[1]);expect(r.quad[3]).toEqual(q[3]);
  expect(r.quad[2]).not.toEqual(q[2]);
 });

 it('sin grilla no mueve nada',()=>{
  const W=400,H=300,data=new Uint8ClampedArray(W*H*4);
  for(let i=0;i<W*H;i++){const v=120+((i*7919)%97);data[i*4]=data[i*4+1]=data[i*4+2]=v;data[i*4+3]=255;}
  const q=[{x:100,y:100},{x:225,y:100},{x:225,y:225},{x:100,y:225}],r=snapQuad(imageSampler({data,width:W,height:H}),q);
  expect(r.quad).toEqual(q);expect(r.snapped).toBe(0);
 });
});

describe('Detección + ajuste + rectángulo amplio',()=>{
 const cases:[string,Point[],boolean,number][]=[['recta',straight,true,0],['perspectiva fuerte',persp,true,0],['perspectiva, ruido de sensor',persp,true,18],['perspectiva, solo líneas gruesas',persp,false,0]];
 for(const [name,quad,thin,noise] of cases)it(`mide la escala sobre todo el papel: ${name}`,()=>{
  const {img,toPlane}=paper(800,600,quad,{w:150,h:100},thin,noise),s=imageSampler(img),t0=Date.now();
  const det=detectGrid(img)!,snapped=snapQuad(s,det.quad).quad,span=grow(s,snapped),ms=Date.now()-t0;
  const c=span.quad.map(toPlane),side=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y);
  // Error relativo de escala: lado real en el papel frente al que se le atribuye.
  const err=Math.max(Math.abs(side(c[0],c[1])/span.w-1),Math.abs(side(c[3],c[2])/span.w-1),Math.abs(side(c[0],c[3])/span.h-1),Math.abs(side(c[1],c[2])/span.h-1));
  const detErr=Math.max(...[[0,1],[3,2],[0,3],[1,2]].map(([i,j])=>{const d=det.quad.map(toPlane);return Math.abs(side(d[i],d[j])/25-1);}));
  console.log(name,JSON.stringify({deteccion_esquina_mm:+Math.max(...det.quad.map(p=>offLattice(toPlane(p)))).toFixed(3),deteccion_escala_pct:+(detErr*100).toFixed(2),ajustado_esquina_mm:+Math.max(...c.map(offLattice)).toFixed(3),rect_mm:[span.w,span.h],escala_pct:+(err*100).toFixed(3),ms}));
  expect(Math.max(...c.map(offLattice))).toBeLessThan(.05);
  expect(span.w).toBeGreaterThanOrEqual(100);expect(span.h).toBeGreaterThanOrEqual(60);
  expect(err).toBeLessThan(.001);
 });

 it('en la captura recta la escala por eje sale exacta (5 px/mm)',()=>{
  const {img}=paper(800,600,straight),s=imageSampler(img),span=grow(s,snapQuad(s,detectGrid(img)!.quad).quad);
  expect(axisAligned(span.quad)).toBe(true);
  const c=quadCalibration(span.quad,span.w,25,span.h);
  expect(Math.abs(c.sx/5-1)).toBeLessThan(.001);expect(Math.abs(c.sy/5-1)).toBeLessThan(.001);
 });
});
