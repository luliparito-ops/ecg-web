import {parseSpeed,latticePitch,gridDeviation,PT_PER_MM} from './pdfvector';
import {describe,it,expect} from 'vitest';
import {initialCalibration,scaled,timeMS,corrected,intersection,previousRR,duration,positions,homography,applyH,invertH,orderQuad,quadProblem,axisAligned,quadCalibration,paperToImage,translate,setEdge,normalizeMeasure,amplitudeUnits,amplitudeMM,amplitudeMV,parseGain,gainOf,readout,summary,measuresCSV,qtStage,copy,type Measure} from './model';
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
 it('lee la velocidad impresa del texto',()=>{expect(parseSpeed('Strip 25.0 mm/s  5.0 mm/mV')).toBe(25);expect(parseSpeed('50,0 mm / s')).toBe(50);expect(parseSpeed('sin dato')).toBeNull();});
 it('encuentra el paso de una retícula y su desvío frente al milímetro físico',()=>{
  const xs=Array.from({length:60},(_,i)=>10+i*2.88);expect(latticePitch(xs)).toBeCloseTo(2.88);
  expect(latticePitch([1,2,3])).toBeNull();
  expect(gridDeviation(2.88)!).toBeCloseTo(2.88/PT_PER_MM-1,6);expect(Math.abs(gridDeviation(5*PT_PER_MM)!)).toBeLessThan(1e-9);
 });
 describe('Calibre RR con amplitud',()=>{
  const cal={...initialCalibration(),sx:8,sy:8,confirmed:true};
  const rr=():Measure=>({id:'r',kind:'RR',x1:100,x2:260,y:300,projection:true});
  it('una medida sin extensión no tiene amplitud ni cambia el tiempo',()=>{
   const m=rr();expect(amplitudeUnits(m)).toBeNull();expect(amplitudeMM(m,cal)).toBeNull();
   expect(duration(m,cal)).toBe(800);expect(readout(m,cal,'Bazett').amplitude).toBeNull();
  });
  it('mide desde la barra hasta la mordaza extendida (arriba, abajo o ambas)',()=>{
   const m=rr();setEdge(m,'top',220);expect(amplitudeMM(m,cal)).toBe(10);expect(amplitudeMV(m,cal)).toBe(1);
   setEdge(m,'bottom',340);expect(amplitudeMM(m,cal)).toBe(15);
   const only=rr();setEdge(only,'bottom',316);expect(amplitudeMM(only,cal)).toBe(2);
   expect(duration(m,cal)).toBe(800);
  });
  it('usa sy y la ganancia, no sx ni el zoom',()=>{
   const m=rr();setEdge(m,'top',220);
   expect(amplitudeMM(m,{...cal,sx:3})).toBe(10);
   expect(amplitudeMM(m,{...cal,sy:4})).toBe(20);
   expect(amplitudeMV(m,{...cal,gain:5})).toBe(2);expect(amplitudeMV(m,{...cal,gain:20})).toBe(.5);
   expect(amplitudeMM(m,{...cal,confirmed:false})).toBeNull();
  });
  it('la mordaza no cruza la barra y se retira cerca de ella',()=>{
   const m=rr();setEdge(m,'top',310);expect(m.top).toBeUndefined();
   setEdge(m,'top',250);expect(m.top).toBe(250);setEdge(m,'top',297,4);expect(m.top).toBeUndefined();
   setEdge(m,'bottom',290);expect(m.bottom).toBeUndefined();setEdge(m,'bottom',Number.NaN);expect(m.bottom).toBeUndefined();
   const q:Measure={...rr(),kind:'QT'};setEdge(q,'top',200);expect(q.top).toBe(200);
  });
  it('normaliza datos inválidos y medidas antiguas',()=>{
   expect(normalizeMeasure({...rr(),top:350,bottom:Number.POSITIVE_INFINITY})).toEqual(rr());
   expect(normalizeMeasure({...rr(),kind:'PR',top:200})).toEqual({...rr(),kind:'PR',top:200});
   expect(normalizeMeasure({...rr(),top:200,bottom:400})).toEqual({...rr(),top:200,bottom:400});
  });
  it('trasladar conserva tiempo y amplitud; copiar (deshacer) conserva la extensión',()=>{
   const m={...rr(),top:220,bottom:330};translate(m,37,-12);
   expect(m).toMatchObject({x1:137,x2:297,y:288,top:208,bottom:318});
   expect(duration(m,cal)).toBe(800);expect(amplitudeMM(m,cal)).toBe(13.75);
   expect(copy(m)).toEqual(m);
   const q:Measure={id:'q',kind:'QT',x1:0,x2:100,y:0,projection:false,rrPrevious:-50,rrCurrent:20,tangent:{a:{x:50,y:30},b:{x:75,y:15},base:0}};
   translate(q,10,5);expect(q.rrPrevious).toBe(-40);expect(q.rrCurrent).toBe(30);expect(q.tangent).toEqual({a:{x:60,y:35},b:{x:85,y:20},base:5});
  });
  it('lee la ganancia impresa',()=>{
   expect(parseGain('25 mm/s  10 mm/mV')).toBe(10);expect(parseGain('5,0 mm / mV')).toBe(5);expect(parseGain('25 mm/s')).toBeNull();
   expect(gainOf(cal)).toBe(10);expect(gainOf({...cal,gain:20})).toBe(20);expect(gainOf({...cal,gain:-1})).toBe(10);
  });
  it('texto de lectura con coma decimal y CSV con columnas de amplitud',()=>{
   const m={...rr(),top:220,bottom:330};
   expect(summary(m,cal,'Bazett')).toBe('RR 800 ms · 75 lpm · 13,8 mm · 1,38 mV');
   const csv=measuresCSV({calibration:cal,measures:[m,{...rr(),id:'p',kind:'PR'}]}).split('\n');
   expect(csv).toContain('# Ganancia mm/mV,10');
   const head=csv.find(l=>l.startsWith('"tipo"'))!.split(','),row=csv[csv.length-2].split(',');
   expect(row[head.indexOf('"amplitud_mm"')]).toBe('"13.75"');expect(row[head.indexOf('"amplitud_mV"')]).toBe('"1.375"');
   expect(csv[csv.length-1].split(',')[head.indexOf('"amplitud_mm"')]).toBe('""');
  });
 });
 it('QT: el avance y el QTc dependen de las dos R',()=>{
  const m:Measure={id:'q',kind:'QT',x1:0,x2:400,y:0,projection:false};
  expect(qtStage(m,c)).toBe(0);expect(readout(m,c,'Bazett').qtc).toBeNull();
  m.rrCurrent=100;expect(qtStage(m,c)).toBe(1);
  m.rrPrevious=-150;expect(qtStage(m,c)).toBe(2);
  // QT 1600 ms, RR 1000 ms: Bazett deja el QT igual.
  expect(readout(m,{...c,sx:10,speed:25},'Bazett').qtc).not.toBeNull();
 });
});
