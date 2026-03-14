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

function buildImagePrompt(body: any) {
  const presentationTitle = safe(body?.presentationTitle);
  const presentationObjective = safe(body?.presentationObjective);
  const presentationPromise = safe(body?.presentationPromise);
  const presentationAudienceTakeaway = safe(body?.presentationAudienceTakeaway);
  const slideTitle = safe(body?.slideTitle);
  const slideGoal = safe(body?.slideGoal);
  const bullets = joinBullets(body?.bullets);
  const speakerNotes = safe(body?.speakerNotes);
  const audiencePrompt = safe(body?.audiencePrompt);
  const visualDirection = safe(body?.visualDirection);
  const existingImagePrompt = safe(body?.imagePrompt);
  const theme = safe(body?.theme || "calm").toLowerCase();

  const themeStyle =
    theme === "corporate"
      ? "clean professional presentation artwork, minimal corporate design, polished, modern, subtle shapes, high clarity"
      : theme === "warm"
      ? "warm educational presentation artwork, soft gradients, welcoming, human, calm, elegant"
      : theme === "dark"
      ? "dark premium presentation artwork, elegant lighting, refined contrast, modern wellbeing visual"
      : "calm wellbeing presentation artwork, soft layered gradients, modern, clean, supportive, polished";

  return [
    "Create a landscape presentation image for a professional wellbeing slide.",
    "The image should feel polished, calm, modern, and suitable for a presentation or webinar.",
    "Do not include any readable text, letters, words, captions, UI, logos, or watermarks.",
    "Do not make it look like a poster with text on it.",
    "Use an editorial presentation background style that supports slide content.",
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
    "The final image must be visually useful as a slide background or side-panel illustration.",
    "Prefer subtle abstract or conceptual visuals over literal or cheesy stock-photo style scenes.",
  ]
    .filter(Boolean)
    .join("\n");
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
        "Soft blue-green layered abstract forms, calm atmosphere, supportive wellbeing tone",
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
        "Warm restorative abstract visual, soft sunrise tones, gentle shapes, calm energy",
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
        "Structured modern workplace visual, subtle geometric forms, calm leadership tone",
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
        "Clean workplace wellbeing visual, modern abstract panels, teal and cyan palette",
    };
  }

  return {
    artworkLabel: "Presentation visual",
    artworkChip: "Calm teaching",
    visualDirection:
      safe(body?.visualDirection) ||
      "Modern calm presentation artwork, soft gradients, subtle abstract shapes, professional wellbeing tone",
  };
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

    const prompt = buildImagePrompt(body);
    const inferred = inferArtworkLabel(body);

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
    });

    const imageBase64 =
      result?.data?.[0]?.b64_json ||
      result?.data?.[0]?.b64Json ||
      "";

    if (!imageBase64) {
      return NextResponse.json(
        {
          error: "Image generation returned no image data.",
          debug: {
            hasDataArray: Array.isArray(result?.data),
            firstItemKeys: result?.data?.[0] ? Object.keys(result.data[0]) : [],
          },
        },
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
      {
        error: e?.message || "Slide image generation failed",
      },
      { status: 500 }
    );
  }
}
