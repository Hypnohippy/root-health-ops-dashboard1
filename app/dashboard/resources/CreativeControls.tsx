import { creativeDirection, ROOT_LAYOUTS } from "@/lib/creativeDirection";
export default function CreativeControls({ value, onChange }: { value: unknown; onChange: (value: NonNullable<ReturnType<typeof creativeDirection>>) => void }) {
  const c = creativeDirection(value);
  if (!c) return null;
  return <fieldset className="root-creative-controls"><legend>Root Calm Premium · slide direction</legend>
    <label>Layout<select value={c.layout} onChange={e => onChange(creativeDirection({ ...c, layout: e.target.value })!)}>{ROOT_LAYOUTS.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
    <label>Artwork<select value={c.artwork} onChange={e => onChange(creativeDirection({ ...c, artwork: e.target.value })!)}>{["none", "panel", "background"].map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Focal position<select value={c.focal} onChange={e => onChange(creativeDirection({ ...c, focal: e.target.value })!)}>{["left", "center", "right"].map(v => <option key={v}>{v}</option>)}</select></label>
    <label>Contrast<select value={c.contrast} onChange={e => onChange(creativeDirection({ ...c, contrast: e.target.value })!)}><option>light</option><option>dark</option></select></label>
  </fieldset>;
}
