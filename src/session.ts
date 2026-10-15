import {validCalibration,type State,type Formula} from './model';
export type Session={format:'ecg-web-session';version:1;file:{name:string;type:string;data:string};page:number;state:State;formula:Formula};
export function validateSession(raw:unknown):Session{
 if(!raw||typeof raw!=='object')throw Error('Sesión inválida.');
 const s=raw as Session;
 if(s.format!=='ecg-web-session'||s.version!==1||!s.file||typeof s.file.data!=='string'||!/^data:(application\/pdf|image\/[\w.+-]+);base64,/.test(s.file.data)||s.file.data.length>85_000_000)throw Error('Formato o documento de sesión inválido.');
 if(!Number.isInteger(s.page)||s.page<1||!s.state||!validCalibration(s.state.calibration)||typeof s.state.calibration.confirmed!=='boolean'||!Array.isArray(s.state.measures)||s.state.measures.length>1000)throw Error('Datos de sesión inválidos.');
 if(!['Bazett','Fridericia','Framingham','Hodges'].includes(s.formula))throw Error('Fórmula desconocida.');
 const ids=new Set<string>();
 for(const m of s.state.measures){
 if(typeof m.id!=='string'||ids.has(m.id)||!['PR','QRS','QT','RR'].includes(m.kind)||![m.x1,m.x2,m.y].every(n=>Number.isFinite(n)&&Math.abs(n)<1e8))throw Error('Medida inválida.');ids.add(m.id);
 if(m.rrPrevious!==undefined&&(!Number.isFinite(m.rrPrevious)||Math.abs(m.rrPrevious)>1e8)||m.rrCurrent!==undefined&&(!Number.isFinite(m.rrCurrent)||Math.abs(m.rrCurrent)>1e8))throw Error('Referencia RR inválida.');
 if(m.tangent&&![m.tangent.a?.x,m.tangent.a?.y,m.tangent.b?.x,m.tangent.b?.y,m.tangent.base].every(n=>Number.isFinite(n)&&Math.abs(n)<1e8))throw Error('Tangente inválida.');
 }
 return s;
}
export function sessionFile(s:Session):File{
 const b64=s.file.data.slice(s.file.data.indexOf(',')+1),binary=atob(b64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new File([bytes],s.file.name||'documento',{type:s.file.data.slice(5,s.file.data.indexOf(';'))});
}
