"use client";
import "./diary.css";
export default function DiaryError({ reset }: { reset: () => void }) {
  return <main className="diary-root"><h1>Diary</h1><p role="alert">Diary could not load. Your source records have not been changed.</p><button onClick={reset}>Try again</button><a href="/dashboard">Return to Home</a></main>;
}
