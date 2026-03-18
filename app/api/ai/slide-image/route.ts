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
        "A premium calm wellbeing illustration with layered blue and green tones, soft lighting, elegant depth, refined abstract human-centred symbolism, and generous negative space for presentation text",
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
        "A premium restorative illustration with warm sunrise tones, elegant layered forms, emotional softness, subtle human symbolism, and clean negative space for presentation content",
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
        "A premium workplace leadership illustration with modern editorial style, refined composition, subtle people-centred symbolism, clean structure, and negative space for slide text",
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
        "A premium workplace wellbeing illustration with polished editorial styling, modern teal and cyan palette, subtle human presence, elegant depth, and clear presentation-friendly space",
    };
  }

  return {
    artworkLabel: "Presentation visual",
    artworkChip: "Calm teaching",
    visualDirection:
      safe(body?.visualDirection) ||
      "A premium modern educational illustration with elegant composition, calm colour grading, soft depth, editorial quality, and generous negative space for slide content",
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
      ? [
          "premium corporate editorial illustration",
          "boardroom-quality presentation aesthetic",
          "refined modern composition",
          "clean professional lighting",
          "high-end consulting deck feel",
          "minimal, elegant, structured, polished",
        ].join(", ")
      : theme === "warm"
      ? [
          "premium warm editorial illustration",
          "soft but luxurious colour grading",
          "elegant human-centred composition",
          "welcoming, polished, modern",
          "presentation-ready visual depth",
        ].join(", ")
      : theme === "dark"
      ? [
          "premium dark editorial illustration",
          "cinematic but clean",
          "rich contrast",
          "high-end presentation aesthetic",
          "modern, refined, sophisticated",
        ].join(", ")
      : [
          "premium calm editorial illustration",
          "high-end wellbeing presentation aesthetic",
          "soft cinematic lighting",
          "elegant modern depth",
          "polished, refined, human-centred",
        ].join(", ");

  return [
    "Create a premium LANDSCAPE 16:9 slide illustration for a professional presentation.",
    "This must look expensive, polished, and deliberately designed.",
    "The image must be clearly visible and visually substantial, not faint, washed out, or just a weak texture.",
    "It should feel like a premium keynote / conference / consultancy presentation visual.",
    "Use a strong focal concept or elegant editorial scene.",
    "Prefer subtle conceptual storytelling, refined symbolism, premium composition, and visual depth.",
    "Leave generous negative space for slide text.",
    "Best layout: focal visual weighted to the right side, lower-right area, or edge-framed composition so text can sit clearly on the left or centre-left.",
    "Do not include readable text, captions, UI, logos, letters, charts, or watermarks.",
    "Do not make it look like clip art, a stock photo, or a generic app illustration.",
    "Do not make it childish, cartoonish, cheesy, or cluttered.",
    "Do not return a barely visible faded background wash.",
    "The final image should feel rich enough that the user immediately notices it.",
    "Use layered lighting, tonal contrast, clean negative space, and tasteful premium depth.",
    "Avoid muddy fog, flat gradients, and weak abstraction with no subject.",
    "If using abstraction, make it elegant, deliberate, and clearly presentation-grade.",
    `Style direction: ${themeStyle}`,
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
    "Important: increase visual richness, clarity, contrast, and composition quality while keeping the slide text area usable.",
    "Important: this should look like premium presentation artwork, not a placeholder image.",
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
            uploadResult.error.message || "Failed to upload image to storage.",
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
