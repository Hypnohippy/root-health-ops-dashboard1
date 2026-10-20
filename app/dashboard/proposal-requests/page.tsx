"use client";

import React, { useEffect, useState } from "react";
import { tenantFetch } from "@/lib/tenantFetch";

type ProposalRequest = {
  id: string;
  created_at: string;
  initiative: string;
  workshop_title: string;
  audience: string;
  duration: string;
  delivery_preference: string;
  delivery_format: string;
  location: string;
  estimated_investment: string;
  notes: string;
  status: string;
  source: string;
  notify_email: string;
  contact_name: string;
contact_email: string;
contact_phone: string;
wants_discussion: boolean;
};

export default function ProposalRequestsPage() {
  const [requests, setRequests] = useState<ProposalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadRequests() {
    setLoading(true);
    setError("");

    try {
      const res = await tenantFetch("/api/proposal-requests", { cache: "no-store" });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to load proposal requests");
      }

      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load proposal requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);
  async function updateRequestStatus(id: string, status: string) {
  try {
    const res = await tenantFetch("/api/proposal-requests", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });

    if (!res.ok) {
      throw new Error("Failed to update request");
    }

    await loadRequests();
  } catch (e: any) {
    setError(e?.message || "Failed to update request");
  }
}

async function deleteRequest(id: string) {
  const ok = window.confirm("Delete this proposal request?");
  if (!ok) return;

  try {
    const res = await tenantFetch("/api/proposal-requests", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      throw new Error("Failed to delete request");
    }

    await loadRequests();
  } catch (e: any) {
    setError(e?.message || "Failed to delete request");
  }
}

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <p style={styles.kicker}>Root Health Ops</p>
        <h1 style={styles.title}>Proposal Requests</h1>
        <p style={styles.subtitle}>
          Workshop and presentation requests generated from Root Health workforce insights.
        </p>
        <p style={styles.subtitle}>Only requests with verified ownership in this organisation appear. Unassigned legacy requests need an explicit ownership review before use.</p>

        <button style={styles.button} onClick={loadRequests}>
          Refresh
        </button>

        {loading ? <p>Loading requests...</p> : null}
        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.grid}>
         {requests.map((item) => (
  <article id={`request-${item.id}`} key={item.id} style={styles.card}>
    <div style={styles.pipelineTop}>
      <div>
        <p style={styles.statusBadge}>{item.status || "pending"}</p>

        <h2 style={styles.leadName}>
          {item.contact_name || "Unknown contact"}
        </h2>

        <p style={styles.leadContact}>
          {item.contact_email || "No email provided"}
          {item.contact_phone ? ` · ${item.contact_phone}` : ""}
        </p>
      </div>

      <strong style={styles.price}>
        {item.estimated_investment || "Investment to confirm"}
      </strong>
    </div>

    <div style={styles.opportunityBlock}>
      <h3 style={styles.cardTitle}>{item.workshop_title}</h3>
      <p style={styles.subtitle}>{item.initiative}</p>

      <p style={styles.summaryLine}>
        {item.audience || "Audience not specified"} ·{" "}
        {item.duration || "Duration not specified"} ·{" "}
        {item.delivery_format || "Format not specified"} ·{" "}
        {item.location || "Online / not specified"}
      </p>

      {item.wants_discussion ? (
        <p style={styles.discussionFlag}>Discussion requested ✅</p>
      ) : null}
    </div>

    {item.notes ? (
      <details style={styles.detailsBox}>
        <summary style={styles.detailsSummary}>Show details</summary>
        <p style={styles.notes}>
          <strong>Notes:</strong> {item.notes}
        </p>
        <p style={styles.notes}>
          <strong>Support:</strong> {item.delivery_preference}
        </p>
        <p style={styles.notes}>
          <strong>Source:</strong> {item.source}
        </p>
      </details>
    ) : (
      <details style={styles.detailsBox}>
        <summary style={styles.detailsSummary}>Show details</summary>
        <p style={styles.notes}>
          <strong>Support:</strong> {item.delivery_preference}
        </p>
        <p style={styles.notes}>
          <strong>Source:</strong> {item.source}
        </p>
      </details>
    )}

    <div style={styles.actions}>
      <button
        style={styles.button}
        onClick={() => {
          const org = new URLSearchParams(window.location.search).get("organisationId");
          window.location.href = `/dashboard/solution-briefs?requestId=${encodeURIComponent(item.id)}${org ? `&organisationId=${encodeURIComponent(org)}` : ""}`;
        }}
      >
        Review Solution Brief
      </button>

      <button
        style={styles.secondaryButton}
        onClick={() => updateRequestStatus(item.id, "in progress")}
      >
        In Progress
      </button>

      <button
        style={styles.secondaryButton}
        onClick={() => updateRequestStatus(item.id, "proposal sent")}
      >
        Proposal Sent
      </button>

      <button
        style={styles.secondaryButton}
        onClick={() => updateRequestStatus(item.id, "accepted")}
      >
        Accepted
      </button>

      <button
        style={styles.secondaryButton}
        onClick={() => updateRequestStatus(item.id, "delivered")}
      >
        Delivered
      </button>

      <button
        style={styles.deleteButton}
        onClick={() => deleteRequest(item.id)}
      >
        Delete
      </button>
    </div>
  </article>
))}
</div>
         

        {!loading && requests.length === 0 ? (
          <p style={styles.empty}>No proposal requests yet.</p>
        ) : null}
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.detail}>
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: "40px",
    background: "#0f172a",
    color: "#0f172a",
  },
  shell: {
    maxWidth: "1180px",
    margin: "0 auto",
    padding: "34px",
    borderRadius: "32px",
    background: "#f8fafc",
  },
  kicker: {
    margin: "0 0 8px",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: "12px",
    fontWeight: 800,
    color: "#64748b",
  },
  title: {
    margin: "0 0 10px",
    fontSize: "42px",
  },
  subtitle: {
    color: "#475569",
    lineHeight: 1.6,
  },
  grid: {
    display: "grid",
    gap: "18px",
    marginTop: "24px",
  },
  card: {
    padding: "24px",
    borderRadius: "24px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "18px",
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: "26px",
  },
  price: {
    fontSize: "18px",
  },
  detailGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "10px",
  marginTop: "18px",
},
  detail: {
  padding: "10px",
    borderRadius: "16px",
    background: "#f1f5f9",
    display: "grid",
    gap: "6px",
  },
  notes: {
    marginTop: "18px",
    color: "#334155",
  },
  actions: {
    display: "flex",
    gap: "12px",
    marginTop: "20px",
    flexWrap: "wrap",
  },
  button: {
    border: "none",
    borderRadius: "999px",
    padding: "12px 18px",
    background: "#0f172a",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: "999px",
    padding: "12px 18px",
    background: "#ffffff",
    color: "#0f172a",
    fontWeight: 800,
    cursor: "pointer",
  },
  deleteButton: {
  border: "1px solid #fecaca",
  borderRadius: "999px",
  padding: "12px 18px",
  background: "#fee2e2",
  color: "#991b1b",
  fontWeight: 800,
  cursor: "pointer",
},
  error: {
    color: "#991b1b",
    fontWeight: 800,
  },
  empty: {
    marginTop: "24px",
    color: "#64748b",
  },
  pipelineTop: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "18px",
  flexWrap: "wrap",
},

statusBadge: {
  display: "inline-block",
  margin: "0 0 10px",
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#fef3c7",
  color: "#92400e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: "11px",
  fontWeight: 900,
},

leadName: {
  margin: 0,
  fontSize: "26px",
  color: "#0f172a",
},

leadContact: {
  margin: "6px 0 0",
  color: "#475569",
  fontSize: "14px",
},

opportunityBlock: {
  marginTop: "16px",
  paddingTop: "16px",
  borderTop: "1px solid #e2e8f0",
},

summaryLine: {
  margin: "10px 0 0",
  color: "#334155",
  fontWeight: 700,
},

discussionFlag: {
  margin: "10px 0 0",
  color: "#166534",
  fontWeight: 900,
},

detailsBox: {
  marginTop: "14px",
  padding: "12px 14px",
  borderRadius: "16px",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
},

detailsSummary: {
  cursor: "pointer",
  fontWeight: 900,
  color: "#334155",
},
};
