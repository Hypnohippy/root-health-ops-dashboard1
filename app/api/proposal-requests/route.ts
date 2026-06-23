import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { error } = await supabaseAdmin.from("proposal_requests").insert({
      initiative: body.initiative || "Recovery Reset Month",
      workshop_title: body.workshop_title || "Recovery & Resilience Workshop",
      audience: body.audience || "",
      duration: body.duration || "",
      delivery_preference: body.delivery_preference || "",
      delivery_format: body.delivery_format || "",
      location: body.location || "",
      estimated_investment: body.estimated_investment || "",
      notify_email: body.notify_email || "david@fuelgeist.co.uk",
      notes: body.notes || "",
      status: "pending",
      source: body.source || "root-health-v2",
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: true },
      { headers: corsHeaders }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed to create request" },
      { status: 500, headers: corsHeaders }
    );
  }
}
