export default function Icon({name}:{name:string}){
 const p:Record<string,React.ReactNode>={
 file:<><path d="M13 2H5v20h14V8l-6-6Zm0 0v6h6M12 12v6m-3-3h6"/></>,
 undo:<path d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12"/>,
 redo:<path d="m15 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/>,
 rotate:<><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.8 1.04 6.44 2.72L21 8"/><path d="M21 3v5h-5"/></>,
 trash:<><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>,
 chevronLeft:<path d="m15 18-6-6 6-6"/>,
 chevronRight:<path d="m9 18 6-6-6-6"/>,
 share:<path d="M7 9H4v12h16V9h-3M12 15V2m-4 4 4-4 4 4"/>,
 more:<><circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/></>,
 records:<><path d="M10 5h11M10 12h11M10 19h11m-18-14 1 1 2-3"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="19" r="1.5"/></>,
 rr:<path d="M4 3v18M20 3v18M4 12h16m-12-3-3 3 3 3m8-6 3 3-3 3"/>,
 pen:<><circle cx="12" cy="12" r="10"/><path d="m7 19 3-11h4l3 11m-7-11 2-4 2 4M9 14h6"/></>,
 ruler:<path d="m4 17 13-13 4 4L8 21Zm3-3 2 2m1-5 2 2m1-5 2 2"/>,
 check:<path d="m5 12 4 4L19 6"/>,close:<path d="m6 6 12 12M18 6 6 18"/>
 };
 return <svg viewBox="0 0 24 24" aria-hidden="true">{p[name]||p.more}</svg>;
}
