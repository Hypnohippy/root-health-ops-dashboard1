import { NextResponse } from "next/server";
import {
  requireOrganisation,
  accessErrorResponse,
} from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs"; 

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  routeContext: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const id =
      (await routeContext.params).id;

    if (!uuid.test(id)) {
      return NextResponse.json(
        {
          success: false,
          error: "Response item is required.",
        },
        { status: 400 }
      );
    }

    const requestedOrganisationId =
      new URL(req.url).searchParams.get(
        "organisationId"
      );

    const tenant =
      await requireOrganisation(
        requestedOrganisationId,
        false
      );

    const organisationId =
      tenant.organisationId;

    /*
     * First resolve the selected Response item.
     * We deliberately derive the Gmail thread from
     * the tenant-owned inbox item rather than trusting
     * a thread ID supplied by the browser.
     */
    const {
      data: item,
      error: itemError,
    } = await supabaseAdmin
      .from("inbox_items")
      .select(
  "id,platform,email_thread_id,email_sent_thread_id,sender_email,email_subject"
)
      .eq(
        "organisation_id",
        organisationId
      )
      .eq(
        "id",
        id
      )
      .maybeSingle();

    if (itemError) {
      throw itemError;
    }

    if (
      !item ||
      item.platform !== "email"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Email response not found.",
        },
        { status: 404 }
      );
    }

    const gmailThreadId =
      item.email_thread_id ||
      item.email_sent_thread_id ||
      null;

    if (!gmailThreadId) {
      return NextResponse.json(
        {
          success: true,
          threadId: null,
          messages: [],
          note:
            "No Gmail thread is recorded for this response yet.",
        },
        {
          headers: {
            "Cache-Control":
              "private, no-store",
          },
        }
      );
    }

    const {
      data: messages,
      error: conversationError,
    } = await supabaseAdmin
      .from(
        "email_conversation_messages"
      )
      .select(
  "id,gmail_thread_id,gmail_message_id,direction,sender_email,recipient_email,subject,body,sent_at,source,inbox_item_id"
)
      .eq(
        "organisation_id",
        organisationId
      )
      .eq(
        "gmail_thread_id",
        gmailThreadId
      )
      .order(
        "sent_at",
        {
          ascending: true,
        }
      );

    if (conversationError) {
      throw conversationError;
    }

    return NextResponse.json(
      {
        success: true,
        threadId:
          gmailThreadId,
        messages:
          messages || [],
      },
      {
        headers: {
          "Cache-Control":
            "private, no-store",
        },
      }
    );

  } catch (error) {
    return (
      accessErrorResponse(error) ||
      NextResponse.json(
        {
          success: false,
          error:
            "Conversation could not be loaded.",
        },
        { status: 503 }
      )
    );
  }
}
