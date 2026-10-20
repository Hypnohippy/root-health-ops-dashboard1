// Code-owned tokens: stored creative metadata can select options, never inject CSS.
export const ROOT_PRESET = {
  preset: "root-calm-premium", version: 1,
  typography: { family: "Arial, sans-serif", titleWeight: 600, bodyWeight: 400 },
  palette: { ink: "#173f35", paper: "#f6f4ed", accent: "#c9dcab", muted: "#547067" },
  spacing: { unit: 8, density: "comfortable", radius: 18 },
} as const;
export const ROOT_LAYOUTS = ["hero", "divider", "framework", "evidence", "exercise", "summary"] as const;
export type RootLayout = typeof ROOT_LAYOUTS[number];
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function creativeDirection(value: unknown) {
  const c = record(value);
  if (c.preset !== ROOT_PRESET.preset || c.version !== 1) return null;
  return { ...ROOT_PRESET,
    layout: ROOT_LAYOUTS.includes(c.layout as RootLayout) ? c.layout as RootLayout : "framework" as RootLayout,
    artwork: c.artwork === "panel" || c.artwork === "background" ? c.artwork : "none" as const,
    focal: c.focal === "left" || c.focal === "right" ? c.focal : "center" as const,
    contrast: c.contrast === "dark" ? "dark" as const : "light" as const,
  };
}
export function rootCreative(layout: string) {
  return creativeDirection({ ...ROOT_PRESET, layout: layout === "reflection" ? "exercise" : layout, artwork: layout === "hero" ? "panel" : "none", focal: "center", contrast: "light" })!;
}
// Headings may arrive as Markdown. Render plain text, never generated HTML.
export function presenterSections(value: unknown) {
  const sections = { Script: "", Facilitation: "", Transition: "", Timing: "" };
  let current: keyof typeof sections = "Script";
  const text = typeof value === "string" ? value : "";
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/\*|_|`/g, "").replace(/^\s*#{1,6}\s*/, "");
    const match = clean.match(/^\s*(Script|Facilitation|Transition|Timing)\s*:?\s*(.*)$/i);
    if (match) { current = (Object.keys(sections).find(k => k.toLowerCase() === match[1].toLowerCase())!) as keyof typeof sections; sections[current] += match[2] + "\n"; }
    else sections[current] += clean + "\n";
  }
  return Object.entries(sections).map(([title, body]) => ({ title, body: body.trim() }));
}
