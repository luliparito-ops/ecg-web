import {describe,it,expect} from 'vitest';
import {detectGrid,type Img} from './gridfinder';
import {type Point} from './model';
import {paper} from './paper.fixture';

/** Error de una detección: esquinas en el plano real (mm). */
function check(d:ReturnType<typeof detectGrid>,toPlane:(p:Point)=>Point){
 expect(d).not.toBeNull();
 const c=d!.quad.map(toPlane),side=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y);
 const lattice=Math.max(...c.map(p=>Math.max(Math.abs(p.x-5*Math.round(p.x/5)),Math.abs(p.y-5*Math.round(p.y/5)))));
 return {sides:[side(c[0],c[1]),side(c[1],c[2]),side(c[2],c[3]),side(c[3],c[0])],lattice,dx:c[1].x-c[0].x,dy:c[1].y-c[0].y,conf:d!.confidence,tiles:d!.tiles,res:d!.residual,c};
}

describe('Detección de grilla',()=>{
 const cases:[string,Point[]][]=[
  ['recta',[{x:60,y:40},{x:60+150*5,y:40},{x:60+150*5,y:40+100*5},{x:60,y:40+100*5}]],
  ['girada 12°',[{x:140,y:30},{x:140+735*Math.cos(.21),y:30+735*Math.sin(.21)},{x:140+735*Math.cos(.21)-490*Math.sin(.21),y:30+735*Math.sin(.21)+490*Math.cos(.21)},{x:140-490*Math.sin(.21),y:30+490*Math.cos(.21)}]],
  ['perspectiva fuerte',[{x:100,y:60},{x:740,y:10},{x:780,y:520},{x:40,y:560}]]
 ];
 for(const [name,quad] of cases)it(`encuentra un cuadrado de 25 mm sobre la grilla: ${name}`,()=>{
  const {img,toPlane}=paper(800,600,quad),t0=Date.now(),r=check(detectGrid(img),toPlane);
  console.log(name,JSON.stringify({sides:r.sides.map(v=>+v.toFixed(2)),lattice:+r.lattice.toFixed(2),dx:+r.dx.toFixed(2),dy:+r.dy.toFixed(2),conf:+r.conf.toFixed(2),tiles:r.tiles,res:+r.res.toFixed(2),ms:Date.now()-t0}));
  for(const s of r.sides)expect(Math.abs(s-25)).toBeLessThan(.6);
  expect(r.lattice).toBeLessThan(.6);
  expect(r.dx).toBeGreaterThan(24);expect(Math.abs(r.dy)).toBeLessThan(.6);
  expect(r.conf).toBeGreaterThan(.5);
 });
 const persp=[{x:100,y:60},{x:740,y:10},{x:780,y:520},{x:40,y:560}];
 for(const [name,thin,noise] of [['solo líneas gruesas',false,0],['con ruido de sensor',true,18]] as const)it(`encuentra el cuadrado con perspectiva: ${name}`,()=>{
  const {img,toPlane}=paper(800,600,persp,{w:150,h:100},thin,noise),r=check(detectGrid(img),toPlane);
  console.log(name,JSON.stringify({sides:r.sides.map(v=>+v.toFixed(2)),lattice:+r.lattice.toFixed(2),conf:+r.conf.toFixed(2)}));
  for(const s of r.sides)expect(Math.abs(s-25)).toBeLessThan(.8);
  expect(r.lattice).toBeLessThan(.8);expect(r.conf).toBeGreaterThan(.4);
 });
 it('sin grilla no detecta nada',()=>{
  const W=400,H=300,data=new Uint8ClampedArray(W*H*4);
  for(let i=0;i<W*H;i++){const v=120+((i*7919)%97);data[i*4]=data[i*4+1]=data[i*4+2]=v;data[i*4+3]=255;}
  const d=detectGrid({data,width:W,height:H});expect(d===null||d.confidence<.5).toBe(true);
 });
});
