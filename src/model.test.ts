import {describe,it,expect} from 'vitest';
import {initialCalibration,scaled,timeMS,corrected,intersection,previousRR,duration,positions,homography,applyH,invertH,orderQuad,quadProblem,axisAligned,quadCalibration,paperToImage,type Measure} from './model';
const c={...initialCalibration(),sx:10,sy:7,confirmed:true};
describe('Motor ECG',()=>{
 it('convierte distancia sin depender de zoom o escala Y',()=>{expect(timeMS(250,c)).toBe(1000);expect(timeMS(250,{...c,sy:.001})).toBe(1000);});
 it('no informa tiempos sin calibración',()=>expect(timeMS(250,{...c,confirmed:false})).toBeNull());
 it('admite compresión horizontal y mantiene Y',()=>{const n=scaled(c,.001,{x:0,y:0},{x:0,y:0},'x');expect(n.sx).toBeCloseTo(.01);expect(n.sy).toBe(7);});
 it('altura no modifica tiempos',()=>{const n=scaled(c,.001,{x:10,y:10},{x:20,y:20},'y');expect(n.sx).toBe(10);expect(timeMS(250,n)).toBe(1000);});
 it('mantiene el ancla durante pinch y pan',()=>{const a={x:37,y:71},b={x:121,y:90},n=scaled(c,2,a,b,'both');expect(n.x+(a.x-c.x)/c.sx*n.sx).toBeCloseTo(b.x);expect(n.y+(a.y-c.y)/c.sy*n.sy).toBeCloseTo(b.y);});
 it('tangente y base determinan final T',()=>{const m:Measure={id:'a',kind:'QT',x1:0,x2:100,y:0,projection:false,tangent:{a:{x:50,y:30},b:{x:75,y:15},base:0}};expect(intersection(m)).toBe(100);expect(duration(m,c)).toBe(400);});
 it('rechaza recta paralela a base',()=>{const m:Measure={id:'a',kind:'QT',x1:0,x2:100,y:0,projection:false,tangent:{a:{x:50,y:30},b:{x:75,y:30},base:0}};expect(intersection(m)).toBeNull();});
 it('RR previo depende de las referencias propias del QT',()=>{const m:Measure={id:'a',kind:'QT',x1:200,x2:290,y:0,projection:false,rrPrevious:10,rrCurrent:210};expect(previousRR(m,c)).toBe(800);expect(previousRR({...m,rrCurrent:300},c)).toBeNull();expect(previousRR({...m,rrPrevious:undefined},c)).toBeNull();});
 it('Bazett y otras fórmulas',()=>{expect(corrected(360,800,'Bazett')).toBeCloseTo(402.49223595);expect(corrected(360,1000,'Fridericia')).toBe(360);expect(corrected(360,1000,'Framingham')).toBe(360);expect(corrected(360,1000,'Hodges')).toBe(360);expect(corrected(360,0,'Bazett')).toBeNull();});
 it('proyecta separación constante',()=>{expect(positions(10,20,100)).toEqual([10,30,50,70,90]);expect(positions(1,0,100)).toEqual([]);});
 it('homografía reproduce las cuatro esquinas y se invierte',()=>{
  const src=[{x:0,y:0},{x:25,y:0},{x:25,y:25},{x:0,y:25}],dst=[{x:103,y:88},{x:410,y:60},{x:455,y:340},{x:90,y:300}];
  const h=homography(src,dst)!;
  src.forEach((p,i)=>{const r=applyH(h,p)!;expect(r.x).toBeCloseTo(dst[i].x,6);expect(r.y).toBeCloseTo(dst[i].y,6);});
  const back=applyH(invertH(h)!,{x:250,y:200})!,again=applyH(h,back)!;expect(again.x).toBeCloseTo(250,6);expect(again.y).toBeCloseTo(200,6);
  expect(applyH(h,{x:12.5,y:12.5})!.x).toBeGreaterThan(100);
 });
 it('puntos colineales no dan homografía',()=>expect(homography([{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}],[{x:0,y:0},{x:1,y:1},{x:2,y:2},{x:3,y:3}])).toBeNull());
 it('detecta cuadrado recto y su escala por eje',()=>{
  const q=[{x:100,y:50},{x:300,y:50},{x:300,y:260},{x:100,y:260}];
  expect(axisAligned(q)).toBe(true);
  const c=quadCalibration(q,25,25);expect(c.sx).toBeCloseTo(8);expect(c.sy).toBeCloseTo(8.4);expect(c.x).toBe(100);
  expect(axisAligned([{x:100,y:50},{x:300,y:58},{x:300,y:260},{x:100,y:260}])).toBe(false);
  expect(axisAligned([{x:100,y:50},{x:300,y:50},{x:300,y:260},{x:100,y:260}].reverse())).toBe(false);
 });
 it('ordena sentido antihorario y rechaza no convexos',()=>{
  const cw=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}],ccw=[cw[0],cw[3],cw[2],cw[1]];
  expect(orderQuad(ccw)).toEqual(cw);expect(orderQuad(cw)).toEqual(cw);
  expect(quadProblem(cw)).toBeNull();
  expect(quadProblem([cw[0],cw[2],cw[1],cw[3]])).not.toBeNull();
  expect(quadProblem([cw[0],{x:2,y:1},cw[2],cw[3]])).not.toBeNull();
 });
 it('plano del papel: el centro del cuadrado cae en el centro de la imagen',()=>{
  const q=[{x:100,y:50},{x:300,y:70},{x:310,y:270},{x:90,y:250}],h=paperToImage(q,25)!;
  const o=applyH(h,{x:0,y:0})!;expect(o.x).toBeCloseTo(100);expect(o.y).toBeCloseTo(50);
 });
});
