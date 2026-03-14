import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

function safe(value: any) {
  return String(value || "").trim();
}

function joinBullets(input: any) {
  if (!Array.isArray(input)) return "";
  return input.map((x) => safe(x)).filter(Boolean).join(" | ");
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
        "A calm supportive wellbeing illustration with soft blue and green tones, gentle depth, clean composition, and space for slide text",
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
        "A warm restorative illustration with sunrise tones, gentle layered forms, recovery symbolism, and space for presentation content",
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
        "A professional people-centred workplace illustration with structured calm composition, modern leadership tone, and clean negative space",
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
        "A clean modern workplace wellbeing illustration with subtle human presence, cyan and teal palette, and a polished presentation look",
    };
  }

  return {
    artworkLabel: "Presentation visual",
    artworkChip: "Calm teaching",
    visualDirection:
      safe(body?.visualDirection) ||
      "A polished modern educational illustration with calm colour, soft depth, and a clear focal visual that supports slide content",
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
      ? "clean professional editorial illustration, polished corporate presentation style, modern, structured, minimal but visible"
      : theme === "warm"
      ? "warm educational editorial illustration, welcoming, soft gradients, human, elegant, clearly visible"
      : theme === "dark"
      ? "dark premium editorial illustration, refined contrast, modern wellbeing aesthetic, cinematic but clean"
      : "calm wellbeing editorial illustration, modern, clean, supportive, polished, clearly visible";

  return [
    "Create a LANDSCAPE 16:9 slide illustration for a professional wellbeing presentation.",
    "This must be a REAL VISIBLE IMAGE, not just a texture wash or faint background tint.",
    "The image should contain a clear focal visual or conceptual scene.",
    "Leave generous negative space for slide text.",
    "Best layout: focal illustration weighted to the right side or lower-right area, with cleaner reading space elsewhere.",
    "The image should feel polished, calm, modern, and presentation-ready.",
    "Do not include any readable text, letters, captions, UI, logos, or watermarks.",
    "Do not make it look like a poster with words on it.",
    "Avoid cheesy stock-photo style visuals.",
    "Avoid flat abstract fog with no subject.",
    "Prefer a clear conceptual illustration, soft human-centred symbolism, or elegant editorial scene.",
    themeStyle,
    presentationTitle ? `Presentation title: ${presentationTitle}` : "",
    presentationObjective ? `Presentation objective: ${presentationObjective}` : "",
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
    "Use calm professional colours and depth.",
    "The final result must work as a presentation slide background or side illustration while still being clearly noticeable.",
  ]
    .filter(Boolean)
    .join("\n");
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
    });

    const imageBase64 = result?.data?.[0]?.b64_json || "";

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Image generation returned no image data." },
        { status: 500 }
      );
    }

    const imageUrl = `data:image/png;base64,${imageBase64}`;

    return NextResponse.json({
      success: true,
      imageUrl,
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
