import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  authorizeIngestion,
  IngestionError,
  readIngestionBody,
  uuid,
} from "@/lib/growthIngestion.server";

const text = (
  value: unknown,
  max: number,
  required = false
) => {
  if (value == null && !required) return null;

  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  ) {
    throw new IngestionError(
      "Invalid acknowledgement."
    );
  }

  return value.trim() || null;
};

export async function POST(req: Request) {
  try {
    const body =
      (await readIngestionBody(req)) as Record<
        string,
        unknown
      >;

    const organisationId =
      text(
        body.organisation_id,
        36,
        true
      )!;

    const sourceEngine =
      text(
        body.source_engine,
        100,
        true
      )!;

    const itemId =
      text(
        body.response_item_id,
        36,
        true
      )!;

    const requestId =
      text(
        body.send_request_id,
        36,
        true
      )!;

    const status =
      text(
        body.status,
        20,
        true
      )!;

    if (
      ![
        organisationId,
        itemId,
        requestId,
      ].every((value) =>
        uuid.test(value)
      ) ||
      !["sent", "failed"].includes(
        status
      )
    ) {
      throw new IngestionError(
        "Invalid acknowledgement."
      );
    }

    authorizeIngestion(
      req.headers.get(
        "authorization"
      ),
      organisationId,
      [sourceEngine]
    );

    const sentAtRaw =
      text(
        body.sent_at,
        100
      );

    const sentAt =
      sentAtRaw
        ? new Date(sentAtRaw)
        : null;

    if (
      sentAt &&
      Number.isNaN(
        sentAt.valueOf()
      )
    ) {
      throw new IngestionError(
        "Invalid acknowledgement."
      );
    }

    const messageId =
      text(
        body.gmail_message_id,
        500
      );

    const threadId =
      text(
        body.gmail_thread_id,
        500
      );

    if (
      status === "sent" &&
      (
        !messageId ||
        !sentAt
      )
    ) {
      throw new IngestionError(
        "A sent acknowledgement requires Gmail message ID and sent timestamp."
      );
    }

    const {
      data,
      error,
    } = await supabaseAdmin.rpc(
      "acknowledge_email_send",
      {
        p_organisation_id:
          organisationId,

        p_inbox_item_id:
          itemId,

        p_send_request_id:
          requestId,

        p_source_engine:
          sourceEngine,

        p_status:
          status,

        p_message_id:
          messageId,

        p_thread_id:
          threadId,

        p_sent_at:
          sentAt?.toISOString() ||
          null,

        p_error:
          text(
            body.error,
            2000
          ),
      }
    );

    if (error) {
      throw error;
    }

    /*
     * Once Gmail confirms the message really sent,
     * add it immediately to the canonical
     * conversation timeline.
     */
    if (
      status === "sent" &&
      messageId &&
      sentAt
    ) {
      const {
        data: sendRequest,
        error: requestError,
      } = await supabaseAdmin
        .from(
          "email_send_requests"
        )
        .select(
          "id,inbox_item_id,recipient,subject,approved_body,gmail_thread_id,gmail_sent_thread_id"
        )
        .eq(
          "organisation_id",
          organisationId
        )
        .eq(
          "id",
          requestId
        )
        .eq(
          "inbox_item_id",
          itemId
        )
        .maybeSingle();

      if (requestError) {
        throw requestError;
      }

      if (!sendRequest) {
        throw new Error(
          "Email send request not found after acknowledgement."
        );
      }

      const conversationThreadId =
        threadId ||
        sendRequest.gmail_sent_thread_id ||
        sendRequest.gmail_thread_id;

      if (
        !conversationThreadId
      ) {
        throw new Error(
          "Sent email has no Gmail thread ID."
        );
      }

      const {
        error: timelineError,
      } = await supabaseAdmin
        .from(
          "email_conversation_messages"
        )
        .upsert(
          {
            organisation_id:
              organisationId,

            gmail_thread_id:
              conversationThreadId,

            gmail_message_id:
              messageId,

            direction:
              "outbound",

            sender_email:
              "enquiries@roothealth.app",

            recipient_email:
              sendRequest.recipient,

            subject:
              sendRequest.subject ||
              "",

            body:
              sendRequest.approved_body ||
              "",

            sent_at:
              sentAt.toISOString(),

            source:
              "ops",

            inbox_item_id:
              itemId,
          },
          {
            onConflict:
              "organisation_id,gmail_message_id",
          }
        );

      if (timelineError) {
        throw timelineError;
      }
    }

    return NextResponse.json({
      success: true,
      status:
        data?.[0]?.status ||
        status,
    });

  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof
          IngestionError
            ? error.message
            : "Unable to record email acknowledgement.",
      },
      {
        status:
          error instanceof
          IngestionError
            ? error.status
            : 503,
      }
    );
  }
}
