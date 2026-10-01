import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  authorizeIngestion,
  IngestionError,
  readIngestionBody,
  uuid,
} from "@/lib/growthIngestion.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const clean = (
  value: unknown,
  max: number,
  required = false
): string | null => {
  if (value == null && !required) return null;

  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  ) {
    throw new IngestionError("Invalid conversation message.");
  }

  return value.trim() || null;
};

export async function POST(req: Request) {
  try {
    const body = (await readIngestionBody(req)) as Record<string, unknown>;

    const organisationId = clean(body.organisation_id, 36, true)!;
    const sourceEngine = clean(body.source_engine, 100, true)!;

    if (!uuid.test(organisationId)) {
      throw new IngestionError("Explicit organisation_id is required.");
    }

    authorizeIngestion(
      req.headers.get("authorization"),
      organisationId,
      [sourceEngine]
    );

    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      body.messages.length > 100
    ) {
      throw new IngestionError("Supply 1–100 conversation messages.");
    }

    const rows = body.messages.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new IngestionError("Invalid conversation message.");
      }

      const message = value as Record<string, unknown>;

      const gmailThreadId = clean(
        message.gmail_thread_id,
        500,
        true
      )!;

      const gmailMessageId = clean(
        message.gmail_message_id,
        500,
        true
      )!;

      const direction = clean(message.direction, 20, true)!;

      if (!["inbound", "outbound"].includes(direction)) {
        throw new IngestionError("Invalid conversation direction.");
      }

      const source = clean(message.source, 30, true)!;

      if (!["gmail_engine", "ops"].includes(source)) {
        throw new IngestionError("Invalid conversation source.");
      }

      const sentAtRaw = clean(message.sent_at, 100, true)!;
      const sentAt = new Date(sentAtRaw);

      if (Number.isNaN(sentAt.valueOf())) {
        throw new IngestionError("Invalid conversation timestamp.");
      }

      const inboxItemId = clean(message.inbox_item_id, 36);

      if (inboxItemId && !uuid.test(inboxItemId)) {
        throw new IngestionError("Invalid inbox item reference.");
      }

      return {
        id: randomUUID(),
        organisation_id: organisationId,
        gmail_thread_id: gmailThreadId,
        gmail_message_id: gmailMessageId,
        direction,
        sender_email: clean(message.sender_email, 500),
        recipient_email: clean(message.recipient_email, 2000),
        subject: clean(message.subject, 1000) || "",
        body: clean(message.body, 50000) || "",
        sent_at: sentAt.toISOString(),
        source,
        inbox_item_id: inboxItemId,
      };
    });

    const { data, error } = await supabaseAdmin
      .from("email_conversation_messages")
      .upsert(rows, {
        onConflict: "organisation_id,gmail_message_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      return NextResponse.json(
        { error: "Unable to import conversation messages." },
        { status: 503 }
      );
    }

    const inserted = data?.length || 0;

    return NextResponse.json({
      success: true,
      received: rows.length,
      inserted,
      duplicates: rows.length - inserted,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof IngestionError
            ? error.message
            : "Unable to import conversation messages.",
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
