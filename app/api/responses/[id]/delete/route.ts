import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = (await params).id;
    const body = await req.json().catch(() => ({}));

    if (
      !uuid.test(id) ||
      !uuid.test(String(body.organisationId || "")) ||
      body.confirm !== "DELETE"
    ) {
      return NextResponse.json(
        { error: "Invalid delete request." },
        { status: 400 }
      );
    }

    const { organisationId } = await requireOrganisation(
      body.organisationId,
      true
    );

    const { data: item, error: readError } = await supabaseAdmin
      .from("inbox_items")
      .select("id")
      .eq("id", id)
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (readError) throw readError;

    if (!item) {
      return NextResponse.json(
        { error: "Response item not found." },
        { status: 404 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("inbox_items")
      .delete()
      .eq("id", id)
      .eq("organisation_id", organisationId);

    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      deletedId: id,
    });
  } catch (error) {
    return (
      accessErrorResponse(error) ||
      NextResponse.json(
        { error: "Unable to delete response item." },
        { status: 503 }
      )
    );
  }
}
