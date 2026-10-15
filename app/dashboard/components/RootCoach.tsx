"use client";
import { useEffect, useRef, useState } from "react";
import { guideDestination, guideWorkspace, type GuideAnswer } from "@/lib/rootCoachGuide";
import "./root-coach.css";

export default function RootCoach({ pathname, organisationId, founderAllowed }: { pathname: string; organisationId: string | null; founderAllowed: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const workspace = guideWorkspace(pathname);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<GuideAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answerContext, setAnswerContext] = useState("");
  const context = `${organisationId}:${pathname}`;
  const currentAnswer = answerContext === context ? answer : null;

  useEffect(() => {
    const element = dialog.current;
    return () => { request.current?.abort(); element?.close(); };
  }, [context]);

  function close() { request.current?.abort(); dialog.current?.close(); }
  function open() {
    setQuestion(""); setAnswer(null); setError(""); setBusy(false);
    dialog.current?.showModal();
  }
  async function ask(text: string) {
    if (!organisationId || !text.trim() || text.length > 600) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setQuestion(text); setBusy(true); setError(""); setAnswer(null); setAnswerContext(context);
    try {
      const response = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
        body: JSON.stringify({ mode: "guidance", organisationId, route: pathname, question: text }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Guidance is unavailable. Continue in the existing workspace.");
      if (!controller.signal.aborted) setAnswer(data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Guidance is unavailable. Continue in the existing workspace."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <>
    <button ref={launcher} type="button" className="root-coach-launcher" disabled={!organisationId} aria-haspopup="dialog" aria-controls="root-coach-dialog" onClick={open}><span aria-hidden="true">✦</span> Ask Root</button>
    <dialog ref={dialog} id="root-coach-dialog" className="root-coach-dialog" aria-labelledby="root-coach-title" aria-describedby="root-coach-boundary" onClose={() => { request.current?.abort(); launcher.current?.focus(); }} onCancel={close}>
      <header className="root-coach-heading"><div><p>YOUR CONTEXTUAL GUIDE</p><h2 id="root-coach-title"><span aria-hidden="true">✦</span> Ask Root</h2></div><button type="button" autoFocus aria-label="Close Ask Root" onClick={close}>×</button></header>
      <div className="root-coach-scroll">
        <p className="root-coach-context">{workspace?.key === "founder" && !founderAllowed ? "Restricted workspace" : workspace?.title || "Current workspace"}</p>
        <p id="root-coach-boundary">Explain, orient, find the right place. Ask Root cannot send, publish, approve, draft outreach or change records.</p>
        <section className="root-coach-intro"><h3>How can I help you here?</h3><p>{workspace?.key === "founder" && !founderAllowed ? "Founder access has not been confirmed. I can help you find your available workspaces." : workspace?.explanation || "I can help you find the existing Ops workspaces. This page has no verified guide yet."}</p></section>
        <div className="root-coach-prompts" aria-label="Suggested questions">{(workspace?.questions || ["Where are my replies?", "Where do I find Relationships?"]).map(prompt => <button key={prompt} type="button" disabled={busy || !organisationId} onClick={() => void ask(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}</div>
        {!organisationId && <p role="status">Waiting for the current organisation. Guidance requests remain disabled until it is verified.</p>}
        {busy && <p role="status">Finding the right guidance…</p>}
        {error && <p role="alert" className="root-coach-error">{error}</p>}
        {currentAnswer && <section className="root-coach-answer" aria-label="Ask Root answer" aria-live="polite"><h3>Root’s guide</h3><p>{currentAnswer.message}</p><nav aria-label="Suggested destinations">{currentAnswer.destinations.map(destination => {
          const safe = guideDestination(destination.id, organisationId || "", founderAllowed);
          return safe ? <a key={safe.id} href={safe.href} onClick={close}>{safe.label}<span aria-hidden="true">→</span></a> : null;
        })}</nav></section>}
      </div>
      <form className="root-coach-form" onSubmit={event => { event.preventDefault(); void ask(question); }}><label htmlFor="root-coach-question">Ask about this workspace</label><textarea id="root-coach-question" rows={2} maxLength={600} value={question} onChange={event => setQuestion(event.target.value)} placeholder="What does this mean, or where should I go?"/><div><small>Current figures and status are always shown in the source workspace.</small><button type="submit" disabled={busy || !organisationId || !question.trim()}>Ask Root <span aria-hidden="true">→</span></button></div></form>
    </dialog>
  </>;
}
