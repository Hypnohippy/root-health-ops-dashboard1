"use client";
import ManualTakeover from "../components/ManualTakeover";
import GrowthTodayVisuals from "./GrowthTodayVisuals";
import { OverviewIcon } from "./relationships/components/RelationshipOverviewVisuals";
import "./growth-today.css";

import { tenantFetch } from "@/lib/tenantFetch";
import LifecycleReconciliationControl from "./LifecycleReconciliationControl";

import { useEffect, useState } from "react";

type LinkedInPostOption = {
  label: string;
  angle: string;
  copy: string;
};

type OutreachTarget = {
  id: string;
  name: string;
  stage: string;
  message: string;
  company?: string;
  role?: string;
  linkedinUrl?: string;
};

export default function GrowthPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  const [planId, setPlanId] = useState<string | null>(null);
  const [selectedPostIndex, setSelectedPostIndex] = useState(0);
  const [postOptions, setPostOptions] = useState<LinkedInPostOption[]>([]);
  const [outreachTargets, setOutreachTargets] = useState<OutreachTarget[]>([]);

  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");

  const [followups, setFollowups] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [followupsLoading, setFollowupsLoading] = useState(true);

  useEffect(() => {
    loadFollowups();
  }, []);

  async function loadFollowups() {
    setFollowupsLoading(true);

    try {
      const res = await tenantFetch("/api/growth/followups-due");
      const json = await res.json();

      if (json.success) {
        setFollowups((json.data || []).slice(0, 10));
      }
    } catch {
      setFollowups([]);
    }

    setFollowupsLoading(false);
  }

  function containsPlaceholder(text: string) {
    return /\[[^\]]+\]/.test(text || "");
  }

  async function generate() {
    setLoading(true);
    setData(null);
    setSaved(false);
    setPlanId(null);
    setApproved(false);
    setRunMessage("");
    setQueue([]);
    setPostOptions([]);
    setOutreachTargets([]);
    setSelectedPostIndex(0);

    try {
      const res = await tenantFetch("/api/ai/growth-engine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          day: new Date().getDate(),
        }),
      });

      const json = await res.json();

      if (!json.success) {
        alert(json.error || "Could not generate today’s plan.");
      } else {
        const generatedPosts = Array.isArray(json.data?.linkedin_posts)
          ? json.data.linkedin_posts
          : [];

        const generatedTargets = Array.isArray(json.data?.outreach_targets)
          ? json.data.outreach_targets
          : [];

        setData(json.data);
        setPlanId(json.id);
        setPostOptions(generatedPosts);
        setOutreachTargets(generatedTargets);
        setSaved(true);
      }
    } catch (err: any) {
      alert(err.message);
    }

    setLoading(false);
  }

  function updatePostCopy(index: number, value: string) {
    setPostOptions((previous) =>
      previous.map((post, i) =>
        i === index
          ? {
              ...post,
              copy: value,
            }
          : post
      )
    );
  }

  function updateOutreachMessage(id: string, value: string) {
    setOutreachTargets((previous) =>
      previous.map((target) =>
        target.id === id
          ? {
              ...target,
              message: value,
            }
          : target
      )
    );
  }

  async function approveAndRunToday() {
    if (!planId) {
      alert("Generate today’s plan first.");
      return;
    }

    const selectedPost = postOptions[selectedPostIndex];

    if (!selectedPost?.copy?.trim()) {
      alert("Choose a LinkedIn post before approving today’s plan.");
      return;
    }

    if (containsPlaceholder(selectedPost.copy)) {
      alert(
        "The selected LinkedIn post still contains placeholder text. Edit it before approval."
      );
      return;
    }

    const badOutreach = outreachTargets.find(
      (target) =>
        !target.message?.trim() ||
        containsPlaceholder(target.message)
    );

    if (badOutreach) {
      alert(
        `The outreach message for ${badOutreach.name || "one contact"} is incomplete or still contains placeholder text.`
      );
      return;
    }

    setRunning(true);
    setRunMessage("");

    try {
      const res = await tenantFetch("/api/growth/approve-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: planId,
          selectedLinkedInPost: selectedPost.copy.trim(),
        }),
      });

      const json = await res.json();

      if (!json.success) {
        alert(json.error || "Could not approve today’s plan.");
        setRunning(false);
        return;
      }

      setApproved(true);

      setQueue(
        outreachTargets.map((target) => ({
          id: target.id,
          target_name: target.name,
          company: target.company || "",
          role_title: target.role || "",
          linkedin_url: target.linkedinUrl || "",
          stage: target.stage,
          message: target.message,
        }))
      );

      await loadFollowups();

      setRunMessage(
        json.alreadyQueued
          ? `Today’s plan was already approved. The selected LinkedIn post is already queued. ${outreachTargets.length} reviewed outreach message${outreachTargets.length === 1 ? "" : "s"} are ready below.`
          : `Today’s plan is approved and running. The selected LinkedIn post has been queued automatically. ${outreachTargets.length} reviewed outreach message${outreachTargets.length === 1 ? "" : "s"} are ready below.`
      );
    } catch (err: any) {
      alert(err.message || "Could not run today’s plan.");
    }

    setRunning(false);
  }

  function updateQueueMessage(id: string, value: string) {
    setQueue((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              message: value,
            }
          : item
      )
    );
  }

  async function updateReply(targetId: string) {
    const statusSelect = document.getElementById(
      `reply-status-${targetId}`
    ) as HTMLSelectElement | null;

    const notesInput = document.getElementById(
      `reply-notes-${targetId}`
    ) as HTMLTextAreaElement | null;

    const reply_status = statusSelect?.value || "no_reply";
    const reply_notes = notesInput?.value || "";

    const res = await tenantFetch("/api/growth/update-reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: targetId,
        reply_status,
        reply_notes,
      }),
    });

    const json = await res.json();

    if (!json.success) {
      alert(json.error || "Could not update reply.");
      return;
    }

    alert("Reply tracking saved ✅");
    await loadFollowups();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text || "");
    alert("Copied ✅");
  }

    const visibleFollowups = followups.filter(
    (followup) =>
      !outreachTargets.some(
        (target) => String(target.id) === String(followup.id)
      )
  );
  
  return (
    <div className="growth-today" style={page}>
      <header className="growth-today-header"><div><p className="growth-today-eyebrow">Growth Operations Centre · Today</p><h1 style={title}><OverviewIcon kind="opportunity"/>Today’s Growth</h1><p style={subtitle}>Generate the day, choose the creative direction, review the real people and messages, then approve once.</p></div><span className="growth-today-status">{approved?"Plan approved":saved?"Plan generated":"No plan generated in this session"}</span></header>
      <GrowthTodayVisuals loading={followupsLoading} followups={visibleFollowups} posts={postOptions.length} targets={outreachTargets.length} approved={approved} saved={saved}/>
      <div className="growth-today-shortcuts">      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <a href="/dashboard/growth/import" style={smallLink}>
          📥 Import Targets
        </a>

        <a href="/dashboard/growth/followups" style={smallLink}>
          👥 Leads
        </a>

        <a href="/dashboard/growth/waiting" style={smallLink}>
          ⏳ Waiting
        </a>

        <a href="/dashboard/growth/pipeline" style={smallLink}>
          💼 Pipeline
        </a>

        <a href="/dashboard/growth/tracker" style={smallLink}>
          📊 Content Tracker
        </a>
      </div>

</div>
      <div className="growth-today-workspace"><div className="growth-today-primary">
      <section className="growth-today-plan" style={card}>
        <h2><OverviewIcon kind="spark"/>Today’s plan</h2>

        <p style={muted}>
          Ops creates three content choices and personalised outreach for the
          actual people due today.
        </p>

        {!data&&<div className="growth-plan-empty"><span className="growth-root-orb" aria-hidden="true"><OverviewIcon kind="spark"/></span><h3>Your next plan starts here</h3><p>Generate to load the actual creative options and named outreach. Nothing has been generated in this session.</p><div><span><OverviewIcon kind="research"/>Creative choices<small>Not generated</small></span><span><OverviewIcon kind="person"/>Named outreach<small>Not established</small></span><span><OverviewIcon kind="conversation"/>Follow-up copy<small>Not generated</small></span></div></div>}

        {saved && (
          <p style={{ marginTop: 12, color: "#087a50" }}>
            Saved to Growth Tracker ✅
          </p>
        )}

        {data && (
          <div style={{ marginTop: 24 }}>
            <Section title="Choose Today’s LinkedIn Post">
              <p style={muted}>
                Pick the version you want. You can edit the final copy before
                approving.
              </p>

              {postOptions.map((post, index) => {
                const selected = selectedPostIndex === index;

                return (
                  <article
                    key={index}
                    style={{
                      ...postCard,
                      border: selected
                        ? "2px solid #22c55e"
                        : "1px solid #334155",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <h3 style={{ margin: 0 }}>
                          {post.label || `Option ${index + 1}`}
                        </h3>

                        <p style={postAngle}>
                          {post.angle || "Alternative creative direction"}
                        </p>
                      </div>

                      <button
                        onClick={() => setSelectedPostIndex(index)}
                        style={selected ? selectedButton : chooseButton}
                      >
                        {selected ? "Selected ✓" : "Use this post"}
                      </button>
                    </div>

                    <textarea
                      value={post.copy || ""}
                      onChange={(event) =>
                        updatePostCopy(index, event.target.value)
                      }
                      style={postEditor}
                    />

                    <button
                      onClick={() => copy(post.copy)}
                      style={copyButton}
                    >
                      Copy
                    </button>
                  </article>
                );
              })}
            </Section>

            <Section title="Today’s Named Outreach">
              <p style={muted}>
                These are the actual contacts whose lifecycle says they are due
                today. Review or edit each message before approval.
              </p>

              {outreachTargets.length === 0 ? (
                <p style={muted}>
                  No outreach targets are due today.
                </p>
              ) : (
                outreachTargets.map((target) => (
                  <article key={target.id} className="growth-target-card" style={targetCard}>
                    <h3 style={{ margin: 0 }}>
                      {target.name}
                    </h3>

                    <p style={muted}>
                      {target.role || "Role not available"}
                      {" · "}
                      {target.company || "Company not available"}
                    </p>

                    <p style={stage}>
                      Stage: {target.stage}
                    </p>

                    {target.linkedinUrl && (
                      <a
                        href={target.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={profileLink}
                      >
                        Open LinkedIn profile
                      </a>
                    )}

                    <textarea
                      value={target.message || ""}
                      onChange={(event) =>
                        updateOutreachMessage(
                          target.id,
                          event.target.value
                        )
                      }
                      style={editableMessage}
                    />

                    <button
                      onClick={() => copy(target.message)}
                      style={copyButton}
                    >
                      Copy
                    </button>
                  </article>
                ))
              )}
            </Section>

            <Section
              title="DM Message"
              onCopy={() => copy(data.dm_message)}
            >
              {data.dm_message}
            </Section>

            <Section
              title="Follow Up"
              onCopy={() => copy(data.follow_up_message)}
            >
              {data.follow_up_message}
            </Section>

            <Section title="SEO Article">
              <strong>{data.seo_article?.title}</strong>

              <ul>
                {data.seo_article?.outline?.map(
                  (item: string, index: number) => (
                    <li key={index}>{item}</li>
                  )
                )}
              </ul>
            </Section>

            <div style={approvalBox}>
              <h2 style={{ marginTop: 0 }}>
                Approve Today’s Plan
              </h2>

              <p style={muted}>
                One approval locks in your selected LinkedIn post and the
                outreach you have reviewed.
              </p>

              <p style={approvalSummary}>
                Selected post:{" "}
                <strong>
                  {postOptions[selectedPostIndex]?.label ||
                    `Option ${selectedPostIndex + 1}`}
                </strong>
                <br />
                Named outreach:{" "}
                <strong>{outreachTargets.length}</strong>
              </p>

              <button
                onClick={approveAndRunToday}
                style={approveButton}
                disabled={running || approved}
              >
                {approved
                  ? "Today’s Plan Approved ✅"
                  : running
                  ? "Starting Today’s Plan..."
                  : "Approve & Run Today ⚡"}
              </button>

              {runMessage && (
                <p style={runStatus}>
                  {runMessage}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="growth-today-approved" style={card}>
        <h2><OverviewIcon kind="contact"/>Approved outreach for today</h2>

        <p style={muted}>
          These are the messages you reviewed above. Nothing is regenerated
          after approval.
        </p>

        {!approved ? (
          <p style={muted}>
            Approve today’s plan to activate this queue.
          </p>
        ) : queue.length === 0 ? (
          <p style={muted}>
            No outreach actions are due today.
          </p>
        ) : (
          queue.map((item) => (
            <article key={item.id} style={targetCard}>
              <h3 style={{ margin: 0 }}>
                {item.target_name}
              </h3>

              <p style={muted}>
                {item.role_title || "Role not available"}
                {" · "}
                {item.company || "Company not available"}
              </p>

              <p style={stage}>
                Stage: {item.stage}
              </p>

              {item.linkedin_url && (
                <a
                  href={item.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  style={profileLink}
                >
                  Open LinkedIn profile
                </a>
              )}

              <textarea
                value={item.message}
                onChange={(event) =>
                  updateQueueMessage(
                    item.id,
                    event.target.value
                  )
                }
                style={editableMessage}
              />

              <button
                onClick={() => copy(item.message)}
                style={copyButton}
              >
                Copy Message
              </button>

              <ManualTakeover organisationId="" table="growth_targets" id={item.id} onComplete={async () => { setQueue(previous => previous.filter(row => row.id !== item.id)); await loadFollowups(); }} />
            </article>
          ))
        )}
      </section>

      <section className="growth-today-followups" style={card}>
        <h2><OverviewIcon kind="clock"/>Follow-ups due today</h2>

        {followupsLoading ? (
          <p style={muted}>
            Loading follow-ups...
          </p>
        ) : visibleFollowups.length === 0 ? (
          <p style={muted}>
            No follow-ups due today.
          </p>
        ) : (
          visibleFollowups.map((target: any) => (
            <article key={target.id} className="growth-target-card" style={targetCard}>
              <h3 style={{ margin: 0 }}>
                {target.target_name}
              </h3>

              <p style={muted}>
                {target.role_title || "Role not added"} ·{" "}
                {target.company || "Company not added"}
              </p>

              <p style={stage}>
                Stage: {target.stage}
              </p>

              <p style={replyStatus}>
                Reply status:{" "}
                {target.reply_status || "no_reply"}
              </p>

              {target.linkedin_url && (
                <a
                  href={target.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  style={profileLink}
                >
                  Open LinkedIn profile
                </a>
              )}

              <details className="growth-followup-detail"><summary><OverviewIcon kind="conversation"/>Review message &amp; reply tracking</summary><div style={messageBox}>
                {target.suggested_message}
              </div>

              <button
                onClick={() =>
                  copy(target.suggested_message)
                }
                style={copyButton}
              >
                Copy Message
              </button>

              <ManualTakeover organisationId="" table="growth_targets" id={target.id} onComplete={async () => { setQueue(previous => previous.filter(row => row.id !== target.id)); await loadFollowups(); }} />

              <div style={replyBox}>
                <h4 style={{ marginTop: 0 }}>
                  Track Reply
                </h4>

                <select
                  id={`reply-status-${target.id}`}
                  defaultValue={
                    target.reply_status || "no_reply"
                  }
                  style={select}
                >
                  <option value="no_reply">
                    No reply yet
                  </option>

                  <option value="replied">
                    Replied
                  </option>

                  <option value="call_booked">
                    Call booked
                  </option>

                  <option value="not_interested">
                    Not interested
                  </option>

                  <option value="warm_lead">
                    Warm lead
                  </option>
                </select>

                <textarea
                  id={`reply-notes-${target.id}`}
                  defaultValue={target.reply_notes || ""}
                  placeholder="Notes e.g. asked for more info, wants pilot details, book call next week..."
                  style={textarea}
                />

                <button
                  onClick={() =>
                    updateReply(target.id)
                  }
                  style={saveReplyButton}
                >
                  Save Reply Tracking
                </button>
              </div></details>
            </article>
          ))
        )}
      </section>
      </div><aside className="growth-today-context"><section className="growth-root-panel"><h2><OverviewIcon kind="spark"/>Root daily briefing</h2><div><span className="growth-root-orb" aria-hidden="true"><OverviewIcon kind="spark"/></span><p>{approved?"The plan is approved. Your reviewed outreach is available in the existing queue.":saved?"Your generated plan is ready for your review. Check the selected post and each named message before approval.":"Start with the contacts already due, then generate a plan when you are ready to review it."}</p><small>Workflow guidance from current page state · no additional AI analysis</small></div></section><section className="growth-value-panel"><h2><OverviewIcon kind="won"/>Commercial value</h2><strong>Not established</strong><p>This Today view does not load a commercial assessment.</p><div className="growth-value-placeholder" aria-hidden="true"><span/><span/><span/></div><a href="/dashboard/growth/pipeline">View existing Pipeline →</a></section><LifecycleReconciliationControl /></aside></div>
      <div className="growth-today-dock">        <button
          onClick={generate}
          style={mainButton}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate Today’s Plan"}
        </button>
      <button
        onClick={() => {
          window.location.href =
            "/dashboard/growth/acquisition" + window.location.search;
        }}
      >
        Open acquisition queue
      </button>

</div>
    </div>
  );
}

function Section({
  title,
  children,
  onCopy,
}: any) {
  return (
    <div style={section}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h2 style={{ margin: 0 }}>
          {title}
        </h2>

        {onCopy && (
          <CopyBtn onClick={onCopy} />
        )}
      </div>

      <div
        style={{
          marginTop: 10,
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CopyBtn({ onClick }: any) {
  return (
    <button
      onClick={onClick}
      style={copyButton}
    >
      Copy
    </button>
  );
}

const page: React.CSSProperties = {
  padding: 0,
  color: "#12213e",
  background: "#f4f7ff",
  minHeight: "100%",
};

const title: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#53627b",
};

const smallLink: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "#ffffff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  textDecoration: "none",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  marginTop: 22,
  background: "#ffffff",
  border: "1px solid #d4ddec",
  borderRadius: 16,
  padding: 18,
};

const mainButton: React.CSSProperties = {
  marginTop: 12,
  padding: "12px 18px",
  borderRadius: 10,
  background: "#ffffff",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const approveButton: React.CSSProperties = {
  marginTop: 10,
  padding: "14px 20px",
  borderRadius: 10,
  background: "#22c55e",
  color: "#020617",
  border: "none",
  fontWeight: 900,
  cursor: "pointer",
  fontSize: 16,
};

const approvalBox: React.CSSProperties = {
  marginTop: 22,
  padding: 18,
  borderRadius: 14,
  background: "#def7e9",
  border: "1px solid #22c55e",
};

const approvalSummary: React.CSSProperties = {
  color: "#176240",
  lineHeight: 1.7,
};

const runStatus: React.CSSProperties = {
  marginTop: 14,
  color: "#176240",
  fontWeight: 700,
  lineHeight: 1.5,
};

const section: React.CSSProperties = {
  background: "#f4f7ff",
  padding: 16,
  borderRadius: 12,
  marginBottom: 16,
  border: "1px solid #d4ddec",
};

const postCard: React.CSSProperties = {
  marginTop: 14,
  padding: 16,
  borderRadius: 12,
  background: "#ffffff",
};

const postAngle: React.CSSProperties = {
  marginTop: 6,
  marginBottom: 0,
  color: "#53627b",
  fontSize: 14,
};

const postEditor: React.CSSProperties = {
  width: "100%",
  minHeight: 220,
  marginTop: 14,
  padding: 14,
  borderRadius: 10,
  background: "#f4f7ff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  lineHeight: 1.6,
};

const chooseButton: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  background: "#e9eef8",
  color: "#12213e",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const selectedButton: React.CSSProperties = {
  ...chooseButton,
  background: "#22c55e",
  color: "#020617",
};

const targetCard: React.CSSProperties = {
  marginTop: 14,
  background: "#f4f7ff",
  border: "1px solid #d4ddec",
  borderRadius: 12,
  padding: 14,
};

const muted: React.CSSProperties = {
  color: "#53627b",
};

const stage: React.CSSProperties = {
  color: "#6033a5",
  fontWeight: 700,
};

const replyStatus: React.CSSProperties = {
  color: "#087a50",
  fontWeight: 700,
};

const profileLink: React.CSSProperties = {
  display: "inline-block",
  marginBottom: 10,
  color: "#164f98",
};

const messageBox: React.CSSProperties = {
  marginTop: 10,
  background: "#ffffff",
  border: "1px solid #d4ddec",
  borderRadius: 10,
  padding: 14,
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const editableMessage: React.CSSProperties = {
  width: "100%",
  minHeight: 120,
  marginTop: 10,
  padding: 12,
  borderRadius: 10,
  background: "#ffffff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const copyButton: React.CSSProperties = {
  marginTop: 10,
  marginRight: 10,
  padding: "7px 10px",
  borderRadius: 8,
  background: "#ffffff",
  color: "#020617",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};


const replyBox: React.CSSProperties = {
  marginTop: 16,
  padding: 14,
  borderRadius: 12,
  background: "#ffffff",
  border: "1px solid #d4ddec",
};

const select: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  background: "#f4f7ff",
  color: "#12213e",
  border: "1px solid #d4ddec",
};

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 80,
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  background: "#f4f7ff",
  color: "#12213e",
  border: "1px solid #d4ddec",
};

const saveReplyButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#38bdf8",
  color: "#020617",
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};
