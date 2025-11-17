import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_SCHEDULE_TABLE = "Scheduled_Posts";
const LINKEDIN_ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN;

async function updateRecord(
  id: string,
  fields: Record<string, any>
): Promise<void> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return;

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

async function deleteRecord(id: string): Promise<void> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return;

  await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(
      AIRTABLE_SCHEDULE_TABLE
    )}/${id}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    }
  );
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

export async function POST(req: NextRequest) {
  try {
    if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
      return NextResponse.json(
        { error: "Airtable is not configured" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { id, action, scheduledTime, title, content, platform } = body || {};

    if (!id || !action) {
      return NextResponse.json(
        { error: "id and action are required" },
        { status: 400 }
      );
    }

    if (action === "reschedule") {
      if (!scheduledTime) {
        return NextResponse.json(
          { error: "scheduledTime is required for reschedule" },
          { status: 400 }
        );
      }

      await updateRecord(id, {
        scheduled_time: scheduledTime,
        status: "pending",
        executed_at: null,
      });

      return NextResponse.json({ ok: true });
    }

    if (action === "cancel") {
      await updateRecord(id, {
        status: "cancelled",
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      await deleteRecord(id);
      return NextResponse.json({ ok: true });
    }

    if (action === "post_now") {
      if (!title || !content || platform !== "LinkedIn") {
        return NextResponse.json(
          { error: "title, content and platform=LinkedIn are required" },
          { status: 400 }
        );
      }

      const authorUrn = await getLinkedInAuthorUrn();
      const text = `${title}\n\n${content}`;
      await postToLinkedIn(text, authorUrn);
      await updateRecord(id, {
        status: "posted",
        executed_at: new Date().toISOString(),
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
