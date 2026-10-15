import {describe,it,expect} from 'vitest';
import {initialCalibration,scaled,timeMS,corrected,intersection,previousRR,duration,positions,type Measure} from './model';
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
});
