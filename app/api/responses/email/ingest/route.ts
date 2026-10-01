import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authorizeIngestion,
  IngestionError,
  readIngestionBody,
  uuid,
} from "@/lib/growthIngestion.server";
import { normalizeEmailClassification } from "@/lib/emailResponse";

export const runtime = "nodejs";

const clean = (
  v: unknown,
  max: number,
  required = false
) => {
  if (v == null && !required) return null;

  if (
    typeof v !== "string" ||
    v.length > max ||
    (required && !v.trim())
  ) {
    throw new IngestionError("Invalid email response field.");
  }

  return v.trim() || null;
};

export async function POST(req: Request) {
  try {
    const body =
      (await readIngestionBody(req)) as Record<string, unknown>;

    const organisationId =
      clean(body.organisation_id, 36, true)!;

    const sourceEngine =
      clean(body.source_engine, 100, true)!;

    if (!uuid.test(organisationId)) {
      throw new IngestionError(
        "Explicit organisation_id is required."
      );
    }

    if (
      !Array.isArray(body.records) ||
      !body.records.length ||
      body.records.length > 100
    ) {
      throw new IngestionError(
        "Supply 1–100 records."
      );
    }

    authorizeIngestion(
      req.headers.get("authorization"),
      organisationId,
      [sourceEngine]
    );

    const rows = body.records.map((value) => {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        throw new IngestionError(
          "Invalid email response record."
        );
      }

      const r = value as Record<string, unknown>;

      const messageId =
        clean(r.message_id, 500, true)!;

      const text =
        clean(r.body, 50000, true)!;

      const subject =
        clean(r.subject, 1000) || "";

      const result =
        normalizeEmailClassification(
          subject,
          text,
          r.classification
        );

      const metadata =
        r.metadata &&
        typeof r.metadata === "object" &&
        !Array.isArray(r.metadata)
          ? r.metadata
          : {};

      return {
        id: randomUUID(),
        organisation_id: organisationId,
        platform: "email",
        kind: "email_reply",
        status: result.needsHumanReply
          ? "needs_reply"
          : "unread",
        text,

        author_name: clean(r.sender_name, 500),
        author_handle: clean(r.sender_email, 500),

        external_id: messageId,

        created_at_platform:
          clean(r.received_at, 100) ||
          new Date().toISOString(),

        inserted_at: new Date().toISOString(),

        post_text: subject,
        post_id: clean(r.thread_id, 500),

        raw: {
          source_engine: sourceEngine,
          metadata,
        },

        email_classification:
          result.classification,

        response_state:
          result.responseState,

        email_thread_id:
          clean(r.thread_id, 500),

        email_message_id:
          messageId,

        in_reply_to:
          clean(r.in_reply_to, 500),

        outreach_reference:
          clean(r.outreach_reference, 500),

        sender_email:
          clean(r.sender_email, 500),

        email_subject:
          subject,

        source_engine:
          sourceEngine,

        proposed_response:
          clean(r.proposed_response, 50000),

        email_reply_draft:
          clean(r.proposed_response, 50000),

        email_delivery_status:
          clean(r.proposed_response, 50000)
            ? "draft"
            : null,
      };
    });

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("inbox_items")
      .upsert(rows, {
        onConflict:
          "organisation_id,email_message_id",
        ignoreDuplicates: true,
      })
      .select("id,email_message_id");

    if (error) {
      return NextResponse.json(
        {
          error:
            "Unable to import email responses.",
        },
        { status: 503 }
      );
    }

    /*
     * Resolve the Inbox item IDs even when this was a duplicate
     * Gmail import. That means the timeline can safely be rebuilt
     * without creating duplicate messages.
     */
    const messageIds =
      rows.map((row) => row.email_message_id);

    const {
      data: storedItems,
      error: storedItemsError,
    } = await supabaseAdmin
      .from("inbox_items")
      .select(
        "id,email_message_id,email_thread_id,sender_email,email_subject,text,created_at_platform"
      )
      .eq("organisation_id", organisationId)
      .in("email_message_id", messageIds);

    if (storedItemsError) {
      return NextResponse.json(
        {
          error:
            "Email replies were imported but the conversation timeline could not be updated.",
        },
        { status: 503 }
      );
    }

    const conversationRows =
      (storedItems || [])
        .filter(
          (item) =>
            item.email_thread_id &&
            item.email_message_id
        )
        .map((item) => ({
          organisation_id:
            organisationId,

          gmail_thread_id:
            item.email_thread_id,

          gmail_message_id:
            item.email_message_id,

          direction:
            "inbound",

          sender_email:
            item.sender_email || null,

          recipient_email:
            "enquiries@roothealth.app",

          subject:
            item.email_subject || "",

          body:
            item.text || "",

          sent_at:
            item.created_at_platform ||
            new Date().toISOString(),

          source:
            "gmail_engine",

          inbox_item_id:
            item.id,
        }));

    if (conversationRows.length) {
      const {
        error: conversationError,
      } = await supabaseAdmin
        .from(
          "email_conversation_messages"
        )
        .upsert(
          conversationRows,
          {
            onConflict:
              "organisation_id,gmail_message_id",
            ignoreDuplicates: true,
          }
        );

      if (conversationError) {
        return NextResponse.json(
          {
            error:
              "Email replies were imported but the conversation timeline could not be updated.",
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      received: rows.length,
      inserted: data?.length || 0,
      duplicates:
        rows.length -
        (data?.length || 0),
      timelineMessages:
        conversationRows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof IngestionError
            ? error.message
            : "Unable to import email responses.",
      },
      {
        status:
          error instanceof IngestionError
            ? error.status
            : 503,
      }
    );
  }
}
