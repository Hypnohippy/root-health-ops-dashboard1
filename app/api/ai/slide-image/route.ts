import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const STORAGE_BUCKET = "resource-library-images";

function safe(value: unknown): string {
  return String(value || "").trim();
}

function joinBullets(input: unknown): string {
  if (!Array.isArray(input)) return "";
  return input.map((x) => safe(x)).filter(Boolean).join(" | ");
}

function slugify(input: unknown): string {
  return safe(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function inferArtworkLabel(body: any) {
  const text = [
    safe(body?.presentationTitle),
    safe(body?.slideTitle),
    safe(body?.slideGoal),
    joinBullets(body?.bullets),
    safe(body?.visualDirection),
  ]
    .join(" ")
    .toLowerCase();

  if (
    text.includes("anxiety") ||
    text.includes("stress") ||
    text.includes("overwhelm") ||
    text.includes("panic")
  ) {
    return {
      artworkLabel: "Calm visual",
      artworkChip: "Breathing space",
      visualDirection:
        safe(body?.visualDirection) ||
        "A calm supportive wellbeing illustration with soft blue and green tones, gentle depth, clear focal subject, polished composition, and enough clean space for slide text",
    };
  }

  if (
    text.includes("burnout") ||
    text.includes("recovery") ||
    text.includes("fatigue") ||
    text.includes("exhaustion")
  ) {
    return {
      artworkLabel: "Recovery visual",
      artworkChip: "Restore pace",
      visualDirection:
        safe(body?.visualDirection) ||
        "A warm restorative illustration with sunrise tones, layered depth, a clear central concept, elegant detail, and enough clean space for presentation content",
    };
  }

  if (
    text.includes("manager") ||
    text.includes("leader") ||
    text.includes("leadership") ||
    text.includes("team")
  ) {
    return {
      artworkLabel: "Leadership visual",
      artworkChip: "Guide with care",
      visualDirection:
        safe(body?.visualDirection) ||
        "A professional people-centred workplace illustration with structured calm composition, visible focal elements, premium presentation style, and room for slide text",
    };
  }

  if (
    text.includes("workplace") ||
    text.includes("staff") ||
    text.includes("organisation") ||
    text.includes("hr")
  ) {
    return {
      artworkLabel: "Workplace visual",
      artworkChip: "Practical culture",
      visualDirection:
        safe(body?.visualDirection) ||
        "A clean modern workplace wellbeing illustration with subtle human presence, confident focal scene, cyan and teal palette, and a polished presentation look",
    };
  }

  return {
    artworkLabel: "Presentation visual",
    artworkChip: "Calm teaching",
    visualDirection:
      safe(body?.visualDirection) ||
      "A polished modern educational illustration with calm colour, layered depth, a clear focal visual, and enough open space for readable slide text",
  };
}

function buildImagePrompt(body: any, inferred: { visualDirection: string }) {
  const presentationTitle = safe(body?.presentationTitle);
  const presentationObjective = safe(body?.presentationObjective);
  const presentationPromise = safe(body?.presentationPromise);
  const presentationAudienceTakeaway = safe(body?.presentationAudienceTakeaway);
  const slideTitle = safe(body?.slideTitle);
  const slideGoal = safe(body?.slideGoal);
  const bullets = joinBullets(body?.bullets);
  const speakerNotes = safe(body?.speakerNotes);
  const audiencePrompt = safe(body?.audiencePrompt);
  const visualDirection =
    safe(body?.visualDirection) || inferred.visualDirection;
  const existingImagePrompt = safe(body?.imagePrompt);
  const theme = safe(body?.theme || "calm").toLowerCase();

  const themeStyle =
    theme === "corporate"
      ? "clean professional editorial illustration, premium corporate presentation style, structured, modern, visible, polished, layered"
      : theme === "warm"
      ? "warm educational editorial illustration, welcoming, elegant, soft gradients, clearly visible, layered and refined"
      : theme === "dark"
      ? "dark premium editorial illustration, refined contrast, modern wellbeing aesthetic, cinematic but clean, clearly visible"
      : "calm wellbeing editorial illustration, modern, premium, supportive, polished, clearly visible, layered and refined";

  return [
    "Create a LANDSCAPE 16:9 slide illustration for a professional wellbeing presentation.",
    "This must be a REAL VISIBLE IMAGE, not just a texture wash or faint background tint.",
    "The image should contain a clear, noticeable focal visual or conceptual editorial scene.",
    "Leave enough clean space for slide text, but do not make the image feel empty or washed out.",
    "Best layout: a strong focal illustration weighted to the right side or lower-right area, with readable space elsewhere.",
    "The image should feel polished, premium, calm, modern, and visually confident.",
    "Use layered composition, depth, contrast, and distinct forms so the image is clearly visible in a presentation.",
    "Do not include any readable text, letters, captions, UI, logos, or watermarks.",
    "Do not make it look like a poster with words on it.",
    "Avoid cheesy stock-photo style visuals.",
    "Avoid flat abstract fog, weak texture-only backgrounds, or visuals that look too faint to notice on a slide.",
    "Prefer elegant editorial-style illustration over vague abstract mist.",
    themeStyle,
    presentationTitle ? `Presentation title: ${presentationTitle}` : "",
    presentationObjective
      ? `Presentation objective: ${presentationObjective}`
      : "",
    presentationPromise ? `Presentation promise: ${presentationPromise}` : "",
    presentationAudienceTakeaway
      ? `Audience takeaway: ${presentationAudienceTakeaway}`
      : "",
    slideTitle ? `Slide title: ${slideTitle}` : "",
    slideGoal ? `Slide goal: ${slideGoal}` : "",
    bullets ? `Slide bullet themes: ${bullets}` : "",
    speakerNotes ? `Speaker note themes: ${speakerNotes}` : "",
    audiencePrompt ? `Audience prompt theme: ${audiencePrompt}` : "",
    visualDirection ? `Preferred visual direction: ${visualDirection}` : "",
    existingImagePrompt ? `Extra image guidance: ${existingImagePrompt}` : "",
    "Make the image visually distinct enough that a user immediately recognises it as an illustration, not merely a colour or texture change.",
    "Use calm professional colours, stronger contrast, richer detail, and visible depth.",
    "The final result must work as a presentation slide background or side illustration while still being clearly noticeable.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildStoragePath(body: any) {
  const presentationSlug = slugify(body?.presentationTitle || "presentation");
  const slideSlug = slugify(body?.slideTitle || "slide");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = randomUUID();

  return `presentations/${presentationSlug}/${slideSlug}-${stamp}-${id}.png`;
}

export async function POST(req: NextRequest) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));

    const slideTitle = safe(body?.slideTitle);
    if (!slideTitle) {
      return NextResponse.json(
        { error: "slideTitle is required." },
        { status: 400 }
      );
    }

    const inferred = inferArtworkLabel(body);
    const prompt = buildImagePrompt(body, inferred);

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      quality: "high",
      background: "opaque",
      output_format: "png",
    });

    const imageBase64 = result?.data?.[0]?.b64_json || "";

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Image generation returned no image data." },
        { status: 500 }
      );
    }

    const imageBuffer = Buffer.from(imageBase64, "base64");
    const storagePath = buildStoragePath(body);

    const uploadResult = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: "image/png",
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadResult.error) {
      return NextResponse.json(
        {
          error:
            uploadResult.error.message ||
            "Failed to upload image to storage.",
        },
        { status: 500 }
      );
    }

    const publicUrlResult = supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    const imageUrl = String(publicUrlResult?.data?.publicUrl || "").trim();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Image uploaded but no public URL was returned." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      storagePath,
      imagePrompt: prompt,
      artworkLabel: inferred.artworkLabel,
      artworkChip: inferred.artworkChip,
      visualDirection: inferred.visualDirection,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Slide image generation failed" },
      { status: 500 }
    );
  }
}
