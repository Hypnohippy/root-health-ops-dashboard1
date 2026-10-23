"use client";
import { useEffect, useRef, useState } from "react";
import { guideDestination, guideAnswerDestination, guideWorkspace, type GuideAnswer, type OpsCoachContext } from "@/lib/rootCoachGuide";
import "./root-coach.css";
import RelationshipProposalReview from "./RelationshipProposalReview";

export default function RootCoach({ pathname, organisationId, founderAllowed }: { pathname: string; organisationId: string | null; founderAllowed: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const selection=useRef<OpsCoachContext|null>(null);
  const conversation = useRef<{ scope: string; answer: GuideAnswer } | null>(null);
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
    return () => { request.current?.abort(); selection.current=null; conversation.current=null; element?.close(); };
  }, [context]);

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ organisationId?: string; locator?: string; question?: string }>).detail;
      if (detail?.organisationId !== organisationId || pathname !== `/dashboard/growth/relationships/${detail?.locator}`) return;
      dialog.current?.showModal();
      void ask(detail.question || "What do we know about this relationship?");
    };
    window.addEventListener("ops-relationship-root", receive);
    return () => window.removeEventListener("ops-relationship-root", receive);
  });

  function close() { request.current?.abort(); dialog.current?.close(); }
  function open() {
    const url=new URL(document.URL),id=url.searchParams.get("resourceId")||url.searchParams.get("itemId")||url.searchParams.get("targetId")||url.searchParams.get("id");
    selection.current=null;
    if(id && /^[a-f0-9-]{36}$/i.test(id)) {
      if(pathname==="/dashboard/responses")selection.current={kind:"source",table:"inbox_items",id};
      else if(pathname==="/dashboard/growth/acquisition")selection.current={kind:"source",table:"acquisition_items",id};
      else if(pathname==="/dashboard/growth/pipeline")selection.current={kind:"source",table:"growth_targets",id};
      else if(pathname==="/dashboard/resources")selection.current={kind:"object",table:"resource_library",id};
      else if(pathname==="/dashboard/sequences")selection.current={kind:"object",table:"sequences",id};
    }
    conversation.current=null; setQuestion(""); setAnswer(null); setError(""); setBusy(false);
    dialog.current?.showModal();
  }
  async function ask(text: string) {
    if (!organisationId || !text.trim() || text.length > 600) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setQuestion(text); setBusy(true); setError(""); setAnswer(null); setAnswerContext(context);
    const retained=conversation.current?.scope===context ? conversation.current.answer : currentAnswer;
    try {
      const response = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
        body: JSON.stringify({ mode: "guidance", organisationId, route: pathname, question: text, ...(retained?.relationshipRoute ? { relationshipRoute: retained.relationshipRoute } : {}), ...(retained?.draftOnly ? {draftOnly:true}:{}), ...((retained?.context || selection.current) ? {context:retained?.context || selection.current} : {}) }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Guidance is unavailable. Continue in the existing workspace.");
      if (!controller.signal.aborted) { setAnswer(data); conversation.current={scope:context,answer:data}; }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Guidance is unavailable. Continue in the existing workspace."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <>
    <button ref={launcher} type="button" className="root-coach-launcher" disabled={!organisationId} aria-haspopup="dialog" aria-controls="root-coach-dialog" onClick={open}><span aria-hidden="true">✦</span> Ask Root</button>
    <dialog ref={dialog} id="root-coach-dialog" className="root-coach-dialog" aria-labelledby="root-coach-title" aria-describedby="root-coach-boundary" onClose={() => { request.current?.abort(); launcher.current?.focus(); }} onCancel={close}>
      <header className="root-coach-heading"><div><p>YOUR CONTEXTUAL GUIDE</p><h2 id="root-coach-title"><span aria-hidden="true">✦</span> Ask Root</h2></div><button type="button" autoFocus aria-label="Close Ask Root" onClick={close}>×</button></header>
      <div className="root-coach-scroll">
        <p className="root-coach-context">{currentAnswer?.workspace || (pathname.startsWith("/dashboard/growth/relationships/") ? "Current relationship · read-only evidence" : workspace?.key === "founder" && !founderAllowed ? "Restricted workspace" : workspace?.title || "Current workspace")}</p>
        <p id="root-coach-boundary">Explain, summarize, interpret, prepare and suggest drafts for review. Ask Root cannot send, publish or execute autonomous updates. On an exact relationship, a separate reviewed proposal requires your explicit confirmation before the existing guarded record action.</p>
        <section className="root-coach-intro"><h3>How can I help you here?</h3><p>{workspace?.key === "founder" && !founderAllowed ? "Founder access has not been confirmed. I can help you find your available workspaces." : workspace?.explanation || "I can help you find the existing Ops workspaces. This page has no verified guide yet."}</p></section>
        <div className="root-coach-prompts" aria-label="Suggested questions">{(workspace?.questions || ["Where are my replies?", "Where do I find Relationships?"]).map(prompt => <button key={prompt} type="button" disabled={busy || !organisationId} onClick={() => void ask(prompt)}>{prompt}<span aria-hidden="true">↗</span></button>)}</div>
        {!organisationId && <p role="status">Waiting for the current organisation. Guidance requests remain disabled until it is verified.</p>}
        {busy && <p role="status">Finding the right guidance…</p>}
        {error && <p role="alert" className="root-coach-error">{error}</p>}
        {currentAnswer && <section className="root-coach-answer" aria-label="Ask Root answer" aria-live="polite"><h3>{currentAnswer.workspace}</h3>{currentAnswer.message.split("\n\n").map((paragraph,index)=><p key={index}>{paragraph}</p>)}{currentAnswer.relationshipChoices?.length ? <nav aria-label="Choose a relationship">{currentAnswer.relationshipChoices.slice(0,5).map(choice=>{
          const safe=guideDestination("relationships",organisationId||"",founderAllowed,choice.route);
          return safe&&safe.href.split("?")[0]===choice.route ? <a key={choice.route} href={safe.href} onClick={close}>{choice.label}<span aria-hidden="true">→</span></a> : null;
        })}</nav> : null}{currentAnswer.publicSources?.length ? <section aria-label="Public research sources"><h4>{currentAnswer.publicResearchNotice?"Unverified source candidates — not attributed to this person":"Public evidence · not identity authority"}</h4>{currentAnswer.publicResearchNotice&&<p role="status">{currentAnswer.publicResearchNotice}</p>}{currentAnswer.publicSources.slice(0,8).map(source=>{let safe=false;try{const url=new URL(source.url);safe=["http:","https:"].includes(url.protocol)&&!url.username&&!url.password;}catch{}return safe?<p key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title||source.url}</a><br/><small>Published: {source.publishedAt||"unknown"} · Retrieved: {source.retrievedAt}</small></p>:null;})}<p>Preview only — nothing saved or linked.</p></section> : null}<nav aria-label="Suggested destinations">{currentAnswer.destinations.map(destination => {
          const safe = guideAnswerDestination(destination, organisationId || "", founderAllowed, currentAnswer.relationshipRoute || pathname);
          return safe ? <a key={safe.href} href={safe.href} onClick={close}>{safe.label}<span aria-hidden="true">→</span></a> : null;
        })}</nav></section>}
        {organisationId && /^\/dashboard\/growth\/relationships\/(?:inbox|target|acquisition|founder|workspace)_[a-f0-9-]{36}$/i.test(pathname) && <RelationshipProposalReview key={context} organisationId={organisationId} locator={pathname.split("/").pop()!} request={question}/>}
      </div>
      <form className="root-coach-form" onSubmit={event => { event.preventDefault(); void ask(question); }}><label htmlFor="root-coach-question">Ask about your work</label><textarea id="root-coach-question" rows={2} maxLength={600} value={question} onChange={event => setQuestion(event.target.value)} placeholder="What does this mean, or where should I go?"/><div><small>Answers use recorded evidence; drafts remain unsent.</small><button type="submit" disabled={busy || !organisationId || !question.trim()}>Ask Root <span aria-hidden="true">→</span></button></div></form>
    </dialog>
  </>;
}
