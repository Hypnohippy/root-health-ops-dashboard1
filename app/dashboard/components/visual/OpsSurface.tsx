import type { HTMLAttributes, ReactNode } from "react";
export type IntelligenceTone = "neutral" | "blue" | "violet" | "green";
export function OpsSurface({tone="neutral",className="",children,...props}:HTMLAttributes<HTMLDivElement>&{tone?:IntelligenceTone}) {
 return <div {...props} data-tone={tone} className={`ops-surface ${className}`}>{children}</div>;
}
export function OpsIntelligenceCard({title,tone,children}:{title:string;tone:Exclude<IntelligenceTone,"neutral">;children:ReactNode}) {
 return <OpsSurface tone={tone} className="ops-intelligence-card"><h2>{title}</h2>{children}</OpsSurface>;
}
