type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
const string = (value: unknown) => typeof value === "string" ? value : "";
// Allowlist, not a blacklist. No source request, internal recommendation or notes.
export function audienceSlide(input: unknown) {
  const s = object(input);
  return {
    slide_title: string(s.slide_title), layout: string(s.layout),
    bullets: Array.isArray(s.bullets) ? s.bullets.filter(v => typeof v === "string") : [],
    audience_prompt: string(s.audience_prompt),
    generated_image_url: string(s.generated_image_url), uploaded_image_url: string(s.uploaded_image_url),
    active_image_source: string(s.active_image_source),
  };
}
export function audienceResource(input: unknown) {
  const r = object(input), c = object(r.content);
  return { id: string(r.id), title: string(r.title), resource_type: string(r.resource_type),
    created_at: string(r.created_at), updated_at: string(r.updated_at),
    content: { slides: Array.isArray(c.slides) ? c.slides.map(audienceSlide) : [] } };
}
export function withSolutionLayouts(input: unknown, measurement: string) {
  const p = object(input);
  if (!Array.isArray(p.slides) || p.slides.length !== 8) throw Error("Presentation generation returned an incomplete deck. Try again.");
  const layouts = ["hero", "divider", "framework", "evidence", "framework", "exercise", "reflection", "summary"];
  const slides: Json[] = p.slides.map((value, i) => {
    const slide = object(value);
    if (!string(slide.slide_title) || !Array.isArray(slide.bullets) || !slide.bullets.length) throw Error("Presentation generation returned an empty slide. Try again.");
    return { uploaded_image_url: "", uploaded_image_status: "", uploaded_image_source: "", uploaded_image_name: "", active_image_source: "", generated_image_url: "", generated_image_prompt: "", generated_image_status: "", generated_image_source: "", artwork_label: "", artwork_chip: "", ...slide, layout: layouts[i] };
  });
  // No verified statistics were supplied by this intake: use an honest measurement
  // plan rather than letting a generated number masquerade as client evidence.
  slides[3] = { ...slides[3], slide_title: "Evidence to collect", bullets: ["Measurement plan for review", measurement], audience_prompt: "", speaker_notes: "Explain that this is a proposed evaluation plan, not a measured result." };
  return { ...p, slides };
}
