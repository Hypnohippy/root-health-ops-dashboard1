import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_SCHEDULE_TABLE = "Scheduled_Posts";
const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;

async function fetchPendingScheduledPosts() {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
    throw new Error("Airtable not configured");
  }

  // Get records where status = 'pending' and scheduled_time <= NOW()
  const formula = `AND({status}='pending', {scheduled_time} <= NOW())`;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
    AIRTABLE_SCHEDULE_TABLE
  )}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=10`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Failed to fetch scheduled posts");
  }

  return (data.records || []) as Array<{
    id: string;
    fields: {
      title?: string;
      body?: string;
      platform?: string;
      scheduled_time?: string;
      status?: string;
    };
  }>;
}

async function getLinkedInAuthorUrn() {
  if (!LINKEDIN_ACCESS_TOKEN) {
    throw new Error("LINKEDIN_ACCESS_TOKEN not configured");
  }

  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.message || "LinkedIn error");
  }

  const sub = data.sub as string | undefined;
  if (!sub) {
    throw new Error("No 'sub' field in LinkedIn userinfo response");
  }
  return `urn:li:person:${sub}`;
}

async function postToLinkedIn(text: string, authorUrn: string) {
  if (!LINKEDIN_ACCESS_TOKEN) {
    throw new Error("LINKEDIN_ACCESS_TOKEN not configured");
  }

  const postBody = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202402",
    },
    body: JSON.stringify(postBody),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to post on LinkedIn");
  }

  return data;
}

async function markRecordStatus(
  id: string,
  status: "posted" | "failed",
  errorMessage?: string
) {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return;

  const fields: Record<string, any> = {
    status,
    executed_at: new Date().toISOString(),
  };
  if (errorMessage) {
    // If you want an error field, add a "error_message" field in Airtable
    fields.error_message = errorMessage;
  }

  await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_SCHEDULE_TABLE
    )}/${id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    }
  );
}

export async function GET(_req: NextRequest) {
  try {
    const records = await fetchPendingScheduledPosts();
    if (!records.length) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    const authorUrn = await getLinkedInAuthorUrn();
    let processed = 0;

    for (const record of records) {
      const { id, fields } = record;
      const platform = fields.platform || "LinkedIn";

      // For now we only auto-post LinkedIn
      if (platform !== "LinkedIn") {
        continue;
      }

      const title = fields.title || "";
      const body = fields.body || "";
      const text = title ? `${title}\n\n${body}` : body;

      try {
        await postToLinkedIn(text, authorUrn);
        await markRecordStatus(id, "posted");
        processed++;
      } catch (err: any) {
        await markRecordStatus(
          id,
          "failed",
          err?.message || "Failed to post to LinkedIn"
        );
      }
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Cron error" },
      { status: 500 }
    );
  }
}
