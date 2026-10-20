import React from "react";
import { audienceSlide } from "@/lib/presentationAudience";
import "./solution-slides.css";

// A shared audience-only renderer. Private notes are never consulted here.
export default function SolutionSlide({ slide }: { slide: unknown }) {
  const s = audienceSlide(slide);
  const image = s.active_image_source === "upload" ? s.uploaded_image_url : s.generated_image_url || s.uploaded_image_url;
  return <section className={`solution-slide solution-slide-${s.layout || "framework"}`} aria-label={s.slide_title}>
    {/* Authenticated uploaded/generated assets retain their original URL; no image proxy or new external fetch service. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image && <img className="solution-slide-art" src={image} alt="" />}
    <p className="solution-slide-kicker">{s.layout === "evidence" ? "MEASUREMENT / PROPOSED EVIDENCE" : s.layout === "exercise" || s.layout === "reflection" ? "PAUSE / PUT IT INTO PRACTICE" : s.layout === "summary" ? "TAKE IT FORWARD" : "ROOT / LEARNING & PRACTICE"}</p>
    <h2>{s.slide_title}</h2><div className="solution-slide-blocks">{s.bullets.map((bullet, i) => <div key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{bullet}</p></div>)}</div>
    {s.audience_prompt && <p className="solution-slide-prompt">{s.audience_prompt}</p>}
  </section>;
}
