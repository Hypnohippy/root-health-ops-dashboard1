"use client";

import React, { useEffect, useState } from "react";

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
};

export default function ProposalRequestsPage() {
  const [requests, setRequests] = useState<ProposalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadRequests() {
    setLoading(true);
    setError("");

    try {
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/proposal_requests?select=*&order=created_at.desc`;

      const res = await fetch(url, {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to load proposal requests");
      }

      setRequests(Array.isArray(data) ? data : []);
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
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/proposal_requests?id=eq.${id}`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ status }),
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
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/proposal_requests?id=eq.${id}`;

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
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

        <button style={styles.button} onClick={loadRequests}>
          Refresh
        </button>

        {loading ? <p>Loading requests...</p> : null}
        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.grid}>
          {requests.map((item) => (
            <article key={item.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <p style={styles.kicker}>{item.status || "pending"}</p>
                  <h2 style={styles.cardTitle}>{item.initiative}</h2>
                  <p style={styles.subtitle}>{item.workshop_title}</p>
                </div>

                <strong style={styles.price}>
                  {item.estimated_investment || "Investment to confirm"}
                </strong>
              </div>

              <div style={styles.detailGrid}>
                <Detail label="Audience" value={item.audience} />
                <Detail label="Duration" value={item.duration} />
                <Detail label="Support" value={item.delivery_preference} />
                <Detail label="Format" value={item.delivery_format} />
                <Detail label="Location" value={item.location || "Online / not specified"} />
                <Detail label="Source" value={item.source} />
              </div>

              {item.notes ? (
                <p style={styles.notes}>
                  <strong>Notes:</strong> {item.notes}
                </p>
              ) : null}

              <div style={styles.actions}>
  <button
  style={styles.button}
  onClick={() => {
    localStorage.setItem(
      "rootops_proposal_request_seed_v1",
      JSON.stringify({
        requestId: item.id,
        title: item.workshop_title || item.initiative,
        goal: `Create a tailored workplace presentation responding to ${item.initiative}.`,
        audience: item.audience,
        duration: item.duration,
        deliveryPreference: item.delivery_preference,
        deliveryFormat: item.delivery_format,
        location: item.location,
        investment: item.estimated_investment,
        notes: item.notes,
      })
    );

    window.location.href = "/dashboard/resources";
  }}
>
  Generate Proposal
</button>

  <button
    style={styles.secondaryButton}
    onClick={() => updateRequestStatus(item.id, "in progress")}
  >
    Mark In Progress
  </button>

  <button
    style={styles.secondaryButton}
    onClick={() => updateRequestStatus(item.id, "proposal sent")}
  >
    Mark Proposal Sent
  </button>

  <button
    style={styles.secondaryButton}
    onClick={() => updateRequestStatus(item.id, "accepted")}
  >
    Mark Accepted
  </button>

  <button
    style={styles.secondaryButton}
    onClick={() => updateRequestStatus(item.id, "delivered")}
  >
    Mark Delivered
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
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
    marginTop: "18px",
  },
  detail: {
    padding: "14px",
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
};
