import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const pillars = [
  "Founder story or reflection",
  "Platform depth and offer clarity",
  "Market insight for the saved audience",
];

function getPillar(day: number) {
  return pillars[day % pillars.length];
}

function containsPlaceholder(value: unknown) {
  if (typeof value === "string") {
    return /\[[^\]]+\]/.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsPlaceholder);
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      containsPlaceholder
    );
  }

  return false;
}

export const POST = withTenantRoute(
  async function POST(req: Request, tenant) {
    try {
      const body = await req.json();

      const day =
        typeof body?.day === "number" && Number.isFinite(body.day)
          ? body.day
          : 1;

      const audience =
        tenant.profile?.customers.audience?.trim() || "";

      const primaryOffer =
        tenant.profile?.offer.primary?.trim() || "";

      const businessName =
        tenant.profile?.business.name?.trim() || "";

      const businessDescription =
        tenant.profile?.business.description?.trim() || "";

      const customerProblems =
        tenant.profile?.customers.problems || [];

      const desiredOutcomes =
        tenant.profile?.customers.desiredOutcomes || [];

      const priorityServices =
        tenant.profile?.offer.priorityServices || [];

      const callToAction =
        tenant.profile?.offer.callToAction?.trim() || "";

      const destinationUrl =
        tenant.profile?.offer.destinationUrl?.trim() || "";

      const tone =
        tenant.profile?.voice.tone?.trim() || "";

      const pillar = getPillar(day);

      const missingProfileFields: string[] = [];

      if (!businessName) {
        missingProfileFields.push("business name");
      }

      if (!audience) {
        missingProfileFields.push("audience");
      }

      if (!primaryOffer) {
        missingProfileFields.push("primary offer");
      }

      if (missingProfileFields.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Growth Profile is missing required information: " +
              missingProfileFields.join(", ") +
              ". Update the Growth Profile before generating today's plan.",
          },
          { status: 400 }
        );
      }

      const prompt = `
You are a world-class growth strategist creating a DAILY growth pack for the business described below.

You already have the organisation context in the preceding messages.

TODAY'S CREATIVE DIRECTION:
${pillar}

IMPORTANT BUSINESS FACTS:
Business name: ${businessName}
Audience: ${audience}
Primary offer: ${primaryOffer}
Business description: ${businessDescription || "Not supplied"}
Customer problems: ${
        customerProblems.length
          ? customerProblems.join(" | ")
          : "Not supplied"
      }
Desired outcomes: ${
        desiredOutcomes.length
          ? desiredOutcomes.join(" | ")
          : "Not supplied"
      }
Priority services: ${
        priorityServices.length
          ? priorityServices.join(" | ")
          : "Not supplied"
      }
Preferred CTA: ${callToAction || "No fixed CTA supplied"}
Destination: ${destinationUrl || "No destination supplied"}
Brand tone: ${tone || "Use a natural professional UK tone"}

RULES:
- Use the real supplied business facts.
- NEVER output placeholders.
- NEVER output bracketed placeholder text such as [Name], [topic], [field], [audience], [offer], [problem], [organisation], [specific point], or anything similar.
- If a detail is unknown, write naturally around it rather than inserting a placeholder.
- Do not invent lived founder experiences.
- Do not invent customer results, testimonials, statistics, certifications or product features.
- No hype.
- No cringe.
- No emojis.
- UK spelling.
- Human, thoughtful, useful and natural.
- Avoid repetitive marketing formulas.
- LinkedIn posts should be complete publishable drafts, not templates.
- Connection messages should be complete reusable messages that do not require placeholders.
- Connection messages must stay under 300 characters.
- DM and follow-up messages should also be complete reusable drafts with no placeholders.
- Return valid JSON only.
- No markdown.
- No explanation outside the JSON.

RETURN THIS EXACT JSON SHAPE:

{
  "linkedin_posts": [
    {
      "label": "Option 1",
      "angle": "short description of the creative angle",
      "copy": "complete publishable LinkedIn post"
    },
    {
      "label": "Option 2",
      "angle": "short description of the creative angle",
      "copy": "complete publishable LinkedIn post"
    },
    {
      "label": "Option 3",
      "angle": "short description of the creative angle",
      "copy": "complete publishable LinkedIn post"
    }
  ],
  "connection_messages": [
    "complete message",
    "complete message"
  ],
  "dm_message": "complete reusable post-connection DM",
  "follow_up_message": "complete reusable follow-up",
  "seo_article": {
    "title": "complete title",
    "outline": [
      "complete outline point"
    ]
  }
}

CONTENT REQUIREMENTS:
1. Create exactly 3 meaningfully different LinkedIn post options.
2. The 3 posts should not simply rewrite the same idea.
3. Create 10 connection message variations.
4. Create one post-connection DM.
5. Create one soft follow-up.
6. Create one SEO article title and useful outline.
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-5.6-terra",
        messages: [
          ...tenant.messages,
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const text =
        completion.choices[0].message?.content || "{}";

      let parsed: any;

      try {
        parsed = JSON.parse(text);
      } catch {
        return NextResponse.json(
          {
            success: false,
            error:
              "AI returned text that was not valid JSON.",
            raw: text,
          },
          { status: 500 }
        );
      }

      if (
        !Array.isArray(parsed.linkedin_posts) ||
        parsed.linkedin_posts.length !== 3
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "AI did not return exactly three LinkedIn post options.",
          },
          { status: 500 }
        );
      }

      if (
        !Array.isArray(parsed.connection_messages) ||
        parsed.connection_messages.length === 0
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "AI did not return connection messages.",
          },
          { status: 500 }
        );
      }

      if (containsPlaceholder(parsed)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "AI returned unresolved placeholder text. Nothing was saved. Please generate again.",
          },
          { status: 422 }
        );
      }

      const firstLinkedInPost =
        parsed.linkedin_posts?.[0]?.copy || "";

      const { data, error } = await supabaseAdmin
        .from("growth_plans")
        .insert({
          organisation_id: tenant.organisationId,
          day_number: day,
          target: audience,
          linkedin_post: firstLinkedInPost,
          connection_messages:
            parsed.connection_messages || [],
          dm_message: parsed.dm_message || "",
          follow_up_message:
            parsed.follow_up_message || "",
          seo_article:
            parsed.seo_article || {},
          raw_output: parsed,
          status: "generated",
        })
        .select("id")
        .single();

      if (error) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        id: data.id,
        data: parsed,
      });
    } catch (error: any) {
      return NextResponse.json(
        {
          success: false,
          error:
            error?.message ||
            "Unable to generate today's growth plan.",
        },
        { status: 500 }
      );
    }
  },
  { generation: true, write: true }
);
