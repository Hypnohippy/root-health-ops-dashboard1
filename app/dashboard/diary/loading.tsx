import "./diary.css";
export default function DiaryLoading() {
  return <main className="diary-root" aria-busy="true"><p className="diary-eyebrow">YOUR DATED OPS WORK</p><h1>Diary</h1><p role="status">Loading recorded commitments and next steps…</p><p>Meetings, follow-ups, tasks and waiting remain separate. Your records are not being changed.</p></main>;
}
