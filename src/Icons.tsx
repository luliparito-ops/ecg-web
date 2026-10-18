// Trazo regular de 1.6 en rejilla de 24, extremos redondeados: misma óptica que los símbolos de sistema de Apple.
const paths:Record<string,React.ReactNode>={
 doc:<><path d="M6.5 3h7.2L19 8.3V19a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M13.5 3.2V8a.5.5 0 0 0 .5.5h4.8"/></>,
 undo:<><path d="M9 6 4.5 10.5 9 15"/><path d="M5 10.5h8.5a5 5 0 0 1 0 10H11"/></>,
 redo:<><path d="m15 6 4.5 4.5L15 15"/><path d="M19 10.5h-8.5a5 5 0 0 0 0 10H13"/></>,
 rotate:<><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/></>,
 grid:<><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/></>,
 share:<><path d="M12 15V3.5M8.3 7.2 12 3.5l3.7 3.7"/><path d="M8 10.5H7a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.5a2 2 0 0 0-2-2h-1"/></>,
 trash:<><path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5"/><path d="M6.5 6.5 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12.5"/><path d="M10 11v5.5M14 11v5.5"/></>,
 chevronLeft:<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>,
 chevronRight:<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>,
 ruler:<><rect x="2.8" y="8.2" width="18.4" height="7.6" rx="2" transform="rotate(-45 12 12)"/><path d="m8.6 11.4 1.7 1.7M11.4 8.6l1.7 1.7M14.2 5.8l1.7 1.7"/></>,
 caliper:<><path d="M5 4v16M19 4v16"/><path d="M5 12h14M8.5 8.8 5 12l3.5 3.2M15.5 8.8 19 12l-3.5 3.2"/></>,
 list:<><circle cx="5" cy="7" r=".9" fill="currentColor"/><circle cx="5" cy="12" r=".9" fill="currentColor"/><circle cx="5" cy="17" r=".9" fill="currentColor"/><path d="M9.5 7H20M9.5 12H20M9.5 17H20"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 minus:<path d="M5 12h14"/>,
 check:<path d="m5.5 12.7 4.2 4.2 8.8-9.6"/>,
 close:<path d="m6.5 6.5 11 11m0-11-11 11"/>,
 tangent:<><path d="M4 18.5 16.5 5.5"/><circle cx="16.5" cy="5.5" r="1.8"/><path d="M4 18.5h16" opacity=".55"/></>,
 arrowX:<path d="M3.5 12h17M7.5 8l-4 4 4 4M16.5 8l4 4-4 4"/>,
 arrowY:<path d="M12 3.5v17M8 7.5l4-4 4 4M8 16.5l4 4 4-4"/>,
 arrowBoth:<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>,
 fit:<path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3"/>,
 photo:<><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 4.6-4.4a1.5 1.5 0 0 1 2.1 0L14 16l1.6-1.6a1.5 1.5 0 0 1 2.1 0L20 16.7"/></>
};
export default function Icon({name}:{name:string}){
 return <svg className="sf" viewBox="0 0 24 24" aria-hidden="true">{paths[name]||paths.doc}</svg>;
}
