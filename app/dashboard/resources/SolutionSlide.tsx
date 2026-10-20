import React from "react";
import { audienceSlide } from "@/lib/presentationAudience";
import { creativeDirection } from "@/lib/creativeDirection";
import "./solution-slides.css";

// A shared audience-only renderer. Private notes are never consulted here.
export default function SolutionSlide({ slide, showArtwork = true, index = 0, total }: { slide: unknown; showArtwork?: boolean; index?: number; total?: number }) {
  const s = audienceSlide(slide);
  const image = s.active_image_source === "upload" ? s.uploaded_image_url : s.generated_image_url || s.uploaded_image_url;
  const c = creativeDirection(s.creative_direction);
  if (c) {
    const prompt = s.audience_prompt || s.bullets[0] || "Take a moment to reflect.";
    const art = showArtwork && image && c.artwork !== "none";
    return <section className={`root-slide-shell root-${c.layout} root-contrast-${c.contrast}`} aria-label={s.slide_title || "Presentation slide"}>
      <div className={`root-canvas ${art ? `root-art-${c.artwork}` : ""}`}>
        {/* Existing authenticated artwork URLs; no proxy or image provider. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {art && <img className="root-art" src={image} alt="" style={{ objectPosition: c.focal }} />}
        <div className="root-slide-content" tabIndex={0} role="region" aria-label="Slide content; scroll for longer text">
          <div className="root-eyebrow">{c.layout === "evidence" ? "PROPOSED MEASUREMENT PLAN" : c.layout === "exercise" ? "PAUSE & REFLECT" : c.layout === "divider" ? `SECTION ${String(index + 1).padStart(2, "0")}` : "ROOT / LEARNING & PRACTICE"}</div>
          <h2>{s.slide_title || "Untitled slide"}</h2>
          {c.layout === "hero" || c.layout === "divider" ? <div className="root-intro">{s.bullets.map((b, i) => <p key={i}>{b}</p>)}</div> :
            c.layout === "framework" ? <ol className="root-process">{(s.bullets.length ? s.bullets : ["Add the reviewed framework in Resources."]).map((b, i) => <li key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{b}</p></li>)}</ol> :
            c.layout === "evidence" ? <div className="root-measurement"><div className="root-measurement-label">PLAN<br /><small>Not a measured result</small></div><div>{s.bullets.map((b, i) => <p key={i}>{b}</p>)}</div></div> :
            c.layout === "exercise" ? <div className="root-exercise"><p className="root-question">{prompt}</p><ol>{s.bullets.filter(b => b !== prompt).map((b, i) => <li key={i}>{b}</li>)}</ol></div> :
            <ol className="root-takeaways">{s.bullets.map((b, i) => <li key={i}><span>{String(i + 1).padStart(2, "0")}</span>{b}</li>)}</ol>}
          {s.audience_prompt && c.layout !== "exercise" && <p className="root-next">{c.layout === "summary" && <strong>Next step · </strong>}{s.audience_prompt}</p>}
        </div>
        <footer><span>ROOT HEALTH</span><span>{String(index + 1).padStart(2, "0")}{total ? ` / ${String(total).padStart(2, "0")}` : ""}</span></footer>
      </div>
    </section>;
  }
  return <section className={`solution-slide solution-slide-${s.layout || "framework"}`} aria-label={s.slide_title}>
    {/* Authenticated uploaded/generated assets retain their original URL; no image proxy or new external fetch service. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image && <img className="solution-slide-art" src={image} alt="" />}
    <p className="solution-slide-kicker">{s.layout === "evidence" ? "MEASUREMENT / PROPOSED EVIDENCE" : s.layout === "exercise" || s.layout === "reflection" ? "PAUSE / PUT IT INTO PRACTICE" : s.layout === "summary" ? "TAKE IT FORWARD" : "ROOT / LEARNING & PRACTICE"}</p>
    <h2>{s.slide_title}</h2><div className="solution-slide-blocks">{s.bullets.map((bullet, i) => <div key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{bullet}</p></div>)}</div>
    {s.audience_prompt && <p className="solution-slide-prompt">{s.audience_prompt}</p>}
  </section>;
}
