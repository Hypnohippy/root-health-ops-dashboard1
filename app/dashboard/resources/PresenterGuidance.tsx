import { presenterSections } from "@/lib/creativeDirection";
export default function PresenterGuidance({ notes }: { notes: unknown }) {
  return <aside className="root-guidance" aria-label="Private presenter guidance"><h2>Private presenter guidance</h2><div>{presenterSections(notes).map(s => <section key={s.title}><h3>{s.title}</h3><p>{s.body || "Review before delivery."}</p></section>)}</div></aside>;
}
