import type { HTMLAttributes, ReactNode } from "react";
export type IntelligenceTone = "neutral" | "blue" | "violet" | "green";
export function OpsSurface({tone="neutral",className="",children,...props}:HTMLAttributes<HTMLDivElement>&{tone?:IntelligenceTone}) {
 return <div {...props} data-tone={tone} className={`ops-surface ${className}`}>{children}</div>;
}
export function OpsIntelligenceCard({title,tone,children}:{title:string;tone:Exclude<IntelligenceTone,"neutral">;children:ReactNode}) {
 return <OpsSurface tone={tone} className="ops-intelligence-card"><span className="ops-intelligence-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{tone==="blue"?<path d="m3 11 18-8-8 18-2-8-8-2Zm8 2L21 3"/>:tone==="violet"?<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>:<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>}</svg></span><h2>{title}</h2>{children}</OpsSurface>;
}

const navigationPaths:Record<string,string>={Diary:"M4 5h16v16H4zM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2",Home:"m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10",Founder:"M9 18h6M10 21h4M8 14c-5-5-2-11 4-11s9 6 4 11l-1 2H9l-1-2",Acquisition:"M3 5h18v14H3zM3 5l9 8 9-8",Responses:"M3 4h18v13H8l-5 4V4",Campaigns:"m3 11 18-8-8 18-2-8-8-2Zm8 2L21 3",Publishing:"M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",Growth:"M4 20V10M10 20V6M16 20V3M3 21h18",Resources:"M4 4h7v16H4zM14 4h6v16h-6",Connect:"M9 8 7 6a4 4 0 0 0-5 6l4 4a4 4 0 0 0 6 0l2-2M15 16l2 2a4 4 0 0 0 5-6l-4-4a4 4 0 0 0-6 0l-2 2"};
export function OpsNavigationIcon({label}:{label:string}) {return <svg className="ops-navigation-icon" aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={navigationPaths[label]||navigationPaths.Growth}/></svg>;}
