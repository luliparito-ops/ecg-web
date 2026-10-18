import {applyH,invertH,type Mat,type Point} from './model';

/** Detección automática de la grilla milimetrada en una imagen (captura o foto): orientación de las dos familias de líneas,
    perspectiva por puntos de fuga, paso de la grilla en la imagen enderezada y cuadrado de 25 mm sobre las líneas. */
export type Img={data:ArrayLike<number>;width:number;height:number};
export type Detection={quad:Point[];confidence:number;pitch:{x:number;y:number};tiles:number;residual:number};

const DEG=Math.PI/180,INK=110;
const mul3=(a:Mat,b:Mat):Mat=>{const o=new Array(9).fill(0);for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)o[i*3+j]+=a[i*3+k]*b[k*3+j];return o;};
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/** Mapa de "líneas finas y oscuras": canal mínimo menos su fondo desenfocado (sirve para rosa, rojo, gris o negro). */
export function featureMap(img:Img):{f:Float32Array;paper:Uint8Array}{
 const {width:W,height:H,data}=img,n=W*H,m=new Float32Array(n);
 for(let i=0;i<n;i++)m[i]=Math.min(data[i*4],data[i*4+1],data[i*4+2]);
 const r=Math.max(3,Math.round(Math.max(W,H)/150)),S=new Float64Array((W+1)*(H+1));
 for(let y=0;y<H;y++){let row=0;for(let x=0;x<W;x++){row+=m[y*W+x];S[(y+1)*(W+1)+x+1]=S[y*(W+1)+x+1]+row;}}
 // Tinta oscura (traza, texto, fondo) ensanchada: su borde suavizado tampoco es grilla.
 const ink=new Uint8Array(n),tmp=new Uint8Array(n),R=2;
 // Grilla con color (rosa, roja, verde): la traza y el texto son neutros; sin color, la tinta es lo oscuro.
 let colored=0;
 for(let i=0;i<n;i++){const r=data[i*4],g=data[i*4+1],b=data[i*4+2],c=Math.max(r,g,b)-m[i];if(c>=14&&m[i]>=140)colored++;}
 const chroma=colored>.003*n;
 for(let i=0;i<n;i++){
  const c=Math.max(data[i*4],data[i*4+1],data[i*4+2])-m[i];
  ink[i]=chroma?(c<9&&m[i]<228?1:0):(m[i]<INK?1:0);
 }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let k=Math.max(0,x-R);k<=Math.min(W-1,x+R)&&!v;k++)v=ink[y*W+k];tmp[y*W+x]=v;}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let v=0;for(let k=Math.max(0,y-R);k<=Math.min(H-1,y+R)&&!v;k++)v=tmp[k*W+x];ink[y*W+x]=v;}
 const f=new Float32Array(n),paper=new Uint8Array(n);
 for(let y=0;y<H;y++){
  const y0=Math.max(0,y-r),y1=Math.min(H,y+r+1);
  for(let x=0;x<W;x++){
   const x0=Math.max(0,x-r),x1=Math.min(W,x+r+1);
   const avg=(S[y1*(W+1)+x1]-S[y0*(W+1)+x1]-S[y1*(W+1)+x0]+S[y0*(W+1)+x0])/((x1-x0)*(y1-y0));
   // La grilla es clara; la tinta oscura (traza, texto) y el fondo oscuro no cuentan.
   paper[y*W+x]=ink[y*W+x]?0:1;
   f[y*W+x]=ink[y*W+x]?0:Math.min(90,Math.max(0,avg-m[y*W+x]));
  }
 }
 return {f,paper};
}

/** Concentración de la energía al proyectarla perpendicular a líneas de dirección `theta`: máxima cuando las líneas se alinean. */
function lineScore(f:Float32Array,W:number,x0:number,y0:number,w:number,h:number,theta:number,stride:number):number{
 const s=Math.sin(theta),c=Math.cos(theta);
 const rmin=Math.min(0,-w*s)+Math.min(0,h*c),rmax=Math.max(0,-w*s)+Math.max(0,h*c);
 const bins=Math.ceil(rmax-rmin)+3,hist=new Float64Array(bins);let total=0;
 for(let y=0;y<h;y+=stride){
  const base=(y0+y)*W+x0;
  for(let x=0;x<w;x+=stride){
   const v=f[base+x];if(v<=0)continue;
   const r=-x*s+y*c-rmin,i=Math.floor(r),t=r-i;
   hist[i]+=v*(1-t);hist[i+1]+=v*t;total+=v;
  }
 }
 if(total<1e-6)return 0;
 let sq=0;for(let i=0;i<bins;i++)sq+=hist[i]*hist[i];
 return sq*bins/(total*total);
}

type Scan={theta:number;peak:number};
/** Mejor dirección en [lo,hi] (rad) y qué tan marcada es frente al fondo (mediana). */
function scanAngles(f:Float32Array,W:number,box:[number,number,number,number],lo:number,hi:number,coarse:number,stride:number):Scan{
 const [x0,y0,w,h]=box,sc:number[]=[],th:number[]=[];
 for(let t=lo;t<=hi+1e-9;t+=coarse){th.push(t);sc.push(lineScore(f,W,x0,y0,w,h,t,stride));}
 let bi=0;for(let i=1;i<sc.length;i++)if(sc[i]>sc[bi])bi=i;
 const med=[...sc].sort((a,b)=>a-b)[sc.length>>1]||1e-9;
 let best=th[bi],bs=sc[bi];
 for(let t=th[bi]-coarse;t<=th[bi]+coarse+1e-9;t+=coarse/12){const v=lineScore(f,W,x0,y0,w,h,t,stride);if(v>bs){bs=v;best=t;}}
 return {theta:best,peak:(bs-med)/med};
}

const angDiff=(a:number,b:number)=>{let d=(a-b)%Math.PI;if(d>Math.PI/2)d-=Math.PI;if(d<-Math.PI/2)d+=Math.PI;return d;};

/** Autovector del menor autovalor de una matriz simétrica 3x3 (Jacobi). */
function smallestEigen(M:number[][]):number[]{
 const A=M.map(r=>[...r]),V=[[1,0,0],[0,1,0],[0,0,1]];
 for(let sweep=0;sweep<40;sweep++){
  let off=0;for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)off+=A[i][j]*A[i][j];
  if(off<1e-24)break;
  for(let p=0;p<2;p++)for(let q=p+1;q<3;q++){
   if(Math.abs(A[p][q])<1e-30)continue;
   const th=(A[q][q]-A[p][p])/(2*A[p][q]),t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1)),c=1/Math.sqrt(t*t+1),s=t*c;
   for(let k=0;k<3;k++){const akp=A[k][p],akq=A[k][q];A[k][p]=c*akp-s*akq;A[k][q]=s*akp+c*akq;}
   for(let k=0;k<3;k++){const apk=A[p][k],aqk=A[q][k];A[p][k]=c*apk-s*aqk;A[q][k]=s*apk+c*aqk;}
   for(let k=0;k<3;k++){const vkp=V[k][p],vkq=V[k][q];V[k][p]=c*vkp-s*vkq;V[k][q]=s*vkp+c*vkq;}
  }
 }
 let mi=0;for(let i=1;i<3;i++)if(A[i][i]<A[mi][mi])mi=i;
 return [V[0][mi],V[1][mi],V[2][mi]];
}

type Obs={cx:number;cy:number;theta:number;w:number};
/** Punto de fuga (homogéneo, coordenadas normalizadas) como intersección por mínimos cuadrados de las rectas observadas. */
function vanishing(obs:Obs[]):number[]{
 const M=[[0,0,0],[0,0,0],[0,0,0]];
 for(const o of obs){
  const a=-Math.sin(o.theta),b=Math.cos(o.theta),l=[a,b,-(a*o.cx+b*o.cy)];
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)M[i][j]+=o.w*l[i]*l[j];
 }
 return smallestEigen(M);
}
function residualDir(v:number[],o:Obs):number{
 const dx=Math.abs(v[2])<1e-9?v[0]:v[0]/v[2]-o.cx,dy=Math.abs(v[2])<1e-9?v[1]:v[1]/v[2]-o.cy;
 return Math.abs(angDiff(Math.atan2(dy,dx),o.theta));
}

function box(arr:number[],r:number):number[]{
 const o=new Array(arr.length).fill(0);
 for(let i=0;i<arr.length;i++){let s=0,n=0;for(let k=-r;k<=r;k++){const j=i+k;if(j>=0&&j<arr.length){s+=arr[j];n++;}}o[i]=s/n;}
 return o;
}

/** Autocorrelación normalizada de un perfil con la tendencia quitada. */
function autocorr(profile:number[],valid:boolean[]):number[]{
 const bg=box(profile,32),p=profile.map((v,i)=>valid[i]?v-bg[i]:0),N=p.length;
 let e=0;for(const v of p)e+=v*v;
 const ac=new Array(Math.floor(N/2)).fill(0);
 if(e<1e-9)return ac;
 for(let L=2;L<ac.length;L++){let s=0;for(let i=0;i+L<N;i++)s+=p[i]*p[i+L];ac[L]=s/e*(N/(N-L));}
 return ac;
}
function peaks(ac:number[],min:number):number[]{
 const out:number[]=[];
 for(let L=3;L<ac.length-1;L++)if(ac[L]>min&&ac[L]>ac[L-1]&&ac[L]>=ac[L+1])out.push(L);
 return out;
}
const parab=(ac:number[],L:number)=>{const a=ac[L-1],b=ac[L],c=ac[L+1],d=a-2*b+c;return Math.abs(d)<1e-12?L:L+.5*(a-c)/d;};

/** Paso de la línea gruesa (5 mm) en un perfil: el menor pico fuerte y, si hay múltiplos de 5, el pico alto dividido por su múltiplo. */
function bigPitch(profile:number[],valid:boolean[]):{pitch:number;strength:number;multi:boolean}|null{
 const ac=autocorr(profile,valid),pk=peaks(ac,.05);
 if(!pk.length)return null;
 const maxH=Math.max(...pk.map(L=>ac[L])),Lmax=pk.find(L=>ac[L]===maxH)!;
 // Fundamental: el menor pico fuerte que divide (casi) exactamente al pico dominante; un pico suelto que no lo divide no cuenta.
 const L0=pk.find(L=>ac[L]>=.5*maxH&&Math.abs(Lmax/L-Math.round(Lmax/L))<.1)??Lmax;
 // ¿L0 es el paso de 1 mm bajo líneas gruesas cada 5·L0? Se pliega el perfil en 5·L0: una de las 5 posiciones debe sobresalir.
 const P5=5*parab(ac,L0),bins=Math.max(10,Math.round(P5*2)),acc=new Array(bins).fill(0),cnt=new Array(bins).fill(0);
 for(let i=0;i<profile.length;i++){if(!valid[i])continue;const bi=Math.floor((i%P5)/P5*bins)%bins;acc[bi]+=profile[i];cnt[bi]++;}
 const fold=acc.map((v,i)=>cnt[i]?v/cnt[i]:0);
 let top=0;for(let i=1;i<bins;i++)if(fold[i]>fold[top])top=i;
 const at=(k:number)=>{const c=(top+k*bins/5+bins)%bins,i=Math.round(c)%bins;return Math.max(fold[(i+bins-1)%bins],fold[i],fold[(i+1)%bins]);};
 const others=[1,2,3,4].map(at),contrast=fold[top]>1e-9?(fold[top]-Math.max(...others))/fold[top]:0;
 let b5=-1;
 for(let L=Math.round(L0*4.8);L<=Math.round(L0*5.2)&&L<ac.length-1;L++)if(ac[L]>ac[L-1]&&ac[L]>=ac[L+1]&&(b5<0||ac[L]>ac[b5]))b5=L;
 if(contrast>.12&&b5>0&&ac[b5]>=.85*ac[L0])return {pitch:parab(ac,b5),strength:ac[b5],multi:true};
 // Una sola periodicidad visible: se asume que son las líneas de 5 mm.
 return {pitch:parab(ac,L0),strength:ac[L0],multi:false};
}

/** Fase (px) de las líneas al plegar el perfil con el período dado. */
function phaseOf(profile:number[],valid:boolean[],period:number):number{
 const bins=Math.max(8,Math.round(period*2)),acc=new Array(bins).fill(0),cnt=new Array(bins).fill(0);
 for(let i=0;i<profile.length;i++){if(!valid[i])continue;const b=Math.floor(((i%period)/period)*bins)%bins;acc[b]+=profile[i];cnt[b]++;}
 let bi=0,bv=-1;for(let b=0;b<bins;b++){const v=cnt[b]?acc[b]/cnt[b]:0;if(v>bv){bv=v;bi=b;}}
 return (bi+.5)/bins*period;
}

export function detectGrid(img:Img,toDoc=1):Detection|null{
  const {width:W,height:H}=img,{f,paper}=featureMap(img);
 // 1) Orientación global de las dos familias (barrido grueso y refinado).
 const sc=[];for(let d=0;d<180;d+=2)sc.push(lineScore(f,W,0,0,W,H,d*DEG,2));
 let a0=0;for(let i=1;i<sc.length;i++)if(sc[i]>sc[a0])a0=i;
 let b0=-1;for(let i=0;i<sc.length;i++){const d=Math.abs(angDiff(i*2*DEG,a0*2*DEG))/DEG;if(d>=40&&(b0<0||sc[i]>sc[b0]))b0=i;}
 if(b0<0)return null;
 const ga=scanAngles(f,W,[0,0,W,H],a0*2*DEG-2*DEG,a0*2*DEG+2*DEG,.5*DEG,2).theta,gb=scanAngles(f,W,[0,0,W,H],b0*2*DEG-2*DEG,b0*2*DEG+2*DEG,.5*DEG,2).theta;

 // 2) Dirección local por baldosa, para ver cómo converge cada familia (perspectiva).
 const T=Math.round(Math.max(W,H)/5),step=Math.round(T*.6),tiles:{cx:number;cy:number;a:Scan;b:Scan}[]=[];
 const S=Math.max(W,H)/2,nx=(x:number)=>(x-W/2)/S,ny=(y:number)=>(y-H/2)/S;
 for(let y=0;y+T<=H;y+=step)for(let x=0;x+T<=W;x+=step){
  const bx:[number,number,number,number]=[x,y,T,T],range=26*DEG;
  const a=scanAngles(f,W,bx,ga-range,ga+range,1*DEG,1),b=scanAngles(f,W,bx,gb-range,gb+range,1*DEG,1);
  tiles.push({cx:x+T/2,cy:y+T/2,a,b});
 }
 const good=tiles.filter(t=>t.a.peak>.3&&t.b.peak>.3);
 if(good.length<4)return null;
 const obsA:Obs[]=good.map(t=>({cx:nx(t.cx),cy:ny(t.cy),theta:t.a.theta,w:Math.min(t.a.peak,20)})),obsB:Obs[]=good.map(t=>({cx:nx(t.cx),cy:ny(t.cy),theta:t.b.theta,w:Math.min(t.b.peak,20)}));
 const fit=(obs:Obs[])=>{
  let use=obs,v=vanishing(use);
  for(let it=0;it<3;it++){
   const keep=use.filter(o=>residualDir(v,o)<4*DEG);
   if(keep.length<4||keep.length===use.length)break;
   use=keep;v=vanishing(use);
  }
  const rms=Math.sqrt(use.reduce((s,o)=>s+residualDir(v,o)**2,0)/use.length)/DEG;
  return {v,rms,n:use.length};
 };
 const fa=fit(obsA),fb=fit(obsB);
 if(fa.n<4||fb.n<4)return null;

 // 3) Rectificación: la línea de fuga a infinito y las dos direcciones a los ejes.
 const l=cross(fa.v,fb.v);
 if(Math.abs(l[2])<1e-9*Math.max(Math.abs(l[0]),Math.abs(l[1]),1e-12))return null;
 const Hp:Mat=[1,0,0,0,1,0,l[0]/l[2],l[1]/l[2],1];
 const dA=[Hp[0]*fa.v[0]+Hp[1]*fa.v[1]+Hp[2]*fa.v[2],Hp[3]*fa.v[0]+Hp[4]*fa.v[1]+Hp[5]*fa.v[2]];
 const dB=[Hp[0]*fb.v[0]+Hp[1]*fb.v[1]+Hp[2]*fb.v[2],Hp[3]*fb.v[0]+Hp[4]*fb.v[1]+Hp[5]*fb.v[2]];
 // La familia más horizontal en la imagen es el eje del tiempo.
 let e1=dA,e2=dB;
 const horiz=(d:number[])=>Math.abs(d[0])/Math.hypot(d[0],d[1]);
 if(horiz(dB)>horiz(dA))[e1,e2]=[dB,dA];
 const n1=Math.hypot(e1[0],e1[1]),n2=Math.hypot(e2[0],e2[1]);
 if(n1<1e-12||n2<1e-12)return null;
 e1=[e1[0]/n1,e1[1]/n1];e2=[e2[0]/n2,e2[1]/n2];
 if(e1[0]<0)e1=[-e1[0],-e1[1]];
 if(e1[0]*e2[1]-e1[1]*e2[0]<0)e2=[-e2[0],-e2[1]];
 const det=e1[0]*e2[1]-e2[0]*e1[1];
 if(Math.abs(det)<1e-3)return null;
 const Ai:Mat=[e2[1]/det,-e2[0]/det,0,-e1[1]/det,e1[0]/det,0,0,0,1];
 const H1=mul3(Ai,Hp),H1i=invertH(H1);
 if(!H1i)return null;

 // 4) Región válida en el plano y escala que conserva la densidad de píxeles en el centro.
 const cxs=good.map(t=>nx(t.cx)),cys=good.map(t=>ny(t.cy)),half=T/2/S;
 const corners:Point[]=[];
 for(let i=0;i<good.length;i++)for(const [dx,dy] of [[-1,-1],[1,-1],[1,1],[-1,1]])corners.push({x:cxs[i]+dx*half,y:cys[i]+dy*half});
 const pc=corners.map(p=>applyH(H1,p));
 if(pc.some(p=>!p))return null;
 const xs=pc.map(p=>p!.x),ys=pc.map(p=>p!.y);
 const gx=cxs.reduce((a,b)=>a+b,0)/cxs.length,gy=cys.reduce((a,b)=>a+b,0)/cys.length;
 const q0=applyH(H1,{x:gx,y:gy}),qx=applyH(H1,{x:gx+.01,y:gy}),qy=applyH(H1,{x:gx,y:gy+.01});
 if(!q0||!qx||!qy)return null;
 const jac=Math.abs((qx.x-q0.x)*(qy.y-q0.y)-(qy.x-q0.x)*(qx.y-q0.y))/1e-4,kk0=S/Math.sqrt(jac);
 const Xmin=Math.min(...xs),Ymin=Math.min(...ys),Xmax=Math.max(...xs),Ymax=Math.max(...ys);
 const kk=Math.min(kk0,1000/(Xmax-Xmin),1000/(Ymax-Ymin));
 const W2=Math.ceil((Xmax-Xmin)*kk),H2=Math.ceil((Ymax-Ymin)*kk);
 if(!(W2>40&&H2>40))return null;

 // 5) Perfiles del mapa enderezado → paso y fase de las líneas gruesas en cada eje.
 const wf=new Float32Array(W2*H2),wp=new Uint8Array(W2*H2);
 for(let v=0;v<H2;v++){
  const Y=Ymin+(v+.5)/kk;
  for(let u=0;u<W2;u++){
   const X=Xmin+(u+.5)/kk,p=applyH(H1i,{x:X,y:Y});
   if(!p)continue;
   const px=p.x*S+W/2-.5,py=p.y*S+H/2-.5;
   if(px<0||py<0||px>=W-1||py>=H-1)continue;
   const x0=Math.floor(px),y0=Math.floor(py),fx=px-x0,fy=py-y0;
   wf[v*W2+u]=(f[y0*W+x0]*(1-fx)+f[y0*W+x0+1]*fx)*(1-fy)+(f[(y0+1)*W+x0]*(1-fx)+f[(y0+1)*W+x0+1]*fx)*fy;
   wp[v*W2+u]=paper[Math.round(py)*W+Math.round(px)];
  }
 }
 // Promedio solo sobre papel claro: ni el fondo oscuro ni la tinta de la traza diluyen o tapan las líneas de la grilla.
 const colP=new Array(W2).fill(0),rowP=new Array(H2).fill(0),colN=new Array(W2).fill(0),rowN=new Array(H2).fill(0);
 for(let v=0;v<H2;v++)for(let u=0;u<W2;u++){const i=v*W2+u;if(!wp[i])continue;colP[u]+=wf[i];colN[u]++;rowP[v]+=wf[i];rowN[v]++;}
 for(let u=0;u<W2;u++)colP[u]=colN[u]?colP[u]/colN[u]:0;
 for(let v=0;v<H2;v++)rowP[v]=rowN[v]?rowP[v]/rowN[v]:0;
 const colV=colN.map(n=>n>=.35*Math.max(...colN)),rowV=rowN.map(n=>n>=.35*Math.max(...rowN));
 const px=bigPitch(colP,colV),py=bigPitch(rowP,rowV);
 if(!px||!py)return null;
 if(px.pitch<4||py.pitch<4)return null;

 // 6) Cuadrado de 25 mm (5 líneas gruesas) sobre las líneas, cerca del centro de la zona válida.
 const phx=phaseOf(colP,colV,px.pitch),phy=phaseOf(rowP,rowV,py.pitch);
 const uc=(q0.x-Xmin)*kk,vc=(q0.y-Ymin)*kk;
 const u0=phx+Math.round((uc-phx)/px.pitch-2.5)*px.pitch,v0=phy+Math.round((vc-phy)/py.pitch-2.5)*py.pitch;
 const sq:Point[]=[{x:u0,y:v0},{x:u0+5*px.pitch,y:v0},{x:u0+5*px.pitch,y:v0+5*py.pitch},{x:u0,y:v0+5*py.pitch}];
 const quad:Point[]=[];
 for(const c of sq){
  const p=applyH(H1i,{x:Xmin+c.x/kk,y:Ymin+c.y/kk});
  if(!p)return null;
  quad.push({x:(p.x*S+W/2)*toDoc,y:(p.y*S+H/2)*toDoc});
 }

 const ratio=Math.max(px.pitch,py.pitch)/Math.min(px.pitch,py.pitch);
 const conf=Math.max(0,Math.min(1,
  Math.min(1,Math.min(px.strength,py.strength)/.35)*
  Math.min(1,good.length/8)*
  Math.max(0,1-Math.max(fa.rms,fb.rms)/3)*
  (ratio<2?1:.4)
 ));
 if(conf<.15)return null;
 return {quad,confidence:conf,pitch:{x:px.pitch,y:py.pitch},tiles:good.length,residual:Math.max(fa.rms,fb.rms)};
}
