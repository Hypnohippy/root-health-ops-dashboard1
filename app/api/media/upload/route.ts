// app/api/media/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // use service role on server only

const supabase = createClient(supabaseUrl, serviceKey);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const organisationId = formData.get("organisationId") as string | null;

    if (!file || !organisationId) {
      return NextResponse.json(
        { error: "file and organisationId are required" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = file.name.split(".").pop() || "bin";
    const path = `${organisationId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const { data: storageRes, error: storageError } = await supabase.storage
      .from("media")
      .upload(path, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (storageError || !storageRes) {
      console.error("Storage error:", storageError);
      return NextResponse.json(
        { error: "Failed to upload to storage" },
        { status: 500 }
      );
    }

    const type = file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
      ? "audio"
      : "other";

    const { data: mediaRow, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        organisation_id: organisationId,
        storage_bucket: "media",
        storage_path: storageRes.path,
        type,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to save media metadata" },
        { status: 500 }
      );
    }

    return NextResponse.json({ media: mediaRow });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message },
      { status: 500 }
    );
  }
}
