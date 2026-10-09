import { cadenceIntent } from "@/lib/growthOutreach";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readDueGrowthTargets } from "@/lib/growthDue.server";

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

      const dueTargets = (await readDueGrowthTargets(tenant.organisationId))
        .filter(
          (target) =>
            !target.lead_quality ||
            target.lead_quality === "unreviewed" ||
            target.lead_quality === "valid"
        )
        .slice(0, 10);

      const outreachContext = dueTargets.map((target) => ({
        id: target.id,
        name: String(target.target_name || ""),
        company: target.company || "",
        role: target.role_title || "",
        stage: target.stage || "connection",
        notes: target.notes || "",
        previousOutbound: (target.manual_completion as {message?: string})?.message || target.last_reply_text || null,
        intent: cadenceIntent(String(target.stage || "connection")),
        replyStatus: target.reply_status || "no_reply",
        replyNotes: target.reply_notes || "",
        dealStage: target.deal_stage || "lead",
        linkedinUrl: target.linkedin_url || "",
      }));

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

TODAY'S ACTUAL OUTREACH TARGETS:
${JSON.stringify(outreachContext)}

RULES:

GENERAL VOICE
- Write like a real person speaking naturally, not like a marketing system.
- Professionally disarming, quietly confident, warm and strong.
- If a human would not naturally say it out loud, do not write it.
- Never sound needy, impressed, over-familiar or salesy.
- Do not try to prove relevance in the opening message.
- Do not recite the person's CV back to them.
- Do not flatter them simply because their profile information is available.
- Keep sentences simple and spoken.
- UK spelling.
- Light humour is welcome when it feels natural.
- A single light emoji such as 😆 is acceptable in outreach when it genuinely helps the tone. Do not force one.
- LinkedIn posts themselves should remain professional and do not need emojis.

BANNED OUTREACH LANGUAGE
Do not use these phrases or close variations:
- "I noticed..."
- "I came across..."
- "I love what you're doing..."
- "Your background caught my eye..."
- "Your experience is impressive..."
- "Your current priorities..."
- "In your world..."
- "People in my network..."
- "I'd love to learn more..."
- "I was impressed by..."
- "Your work caught my attention..."
- "I am connecting with people interested in..."
- "I thought your profile looked interesting..."

Do not replace those phrases with equally artificial corporate language.

RELATIONSHIP PHILOSOPHY
The relationship sequence is:

1. Warm
2. Smile
3. Familiarity
4. Relevance
5. Graceful close

Friendship first.
Context second.
Relevance third.
Pitch later.

The first message must feel like the beginning of a relationship, not the beginning of a funnel.

OUTREACH BY LIFECYCLE STAGE

For each outreach target, follow its supplied stage intent, actual previousOutbound text and the current organisation Growth Profile. Never repeat the first message, invent a past send or use another organisation's messaging. No follow-up without recorded outbound text.

OUTPUT
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
  "outreach_targets": [
    {
      "id": "exact target id supplied above",
      "name": "exact target name supplied above",
      "stage": "exact target stage supplied above",
      "message": "complete personalised message"
    }
  ],
  "dm_message": "complete reusable warm relationship-first message with no placeholders",
  "follow_up_message": "complete reusable light human check-in with no placeholders",
  "seo_article": {
    "title": "complete title",
    "outline": [
      "complete outline point"
    ]
  }
}

CONTENT REQUIREMENTS:
1. Create exactly 3 meaningfully different LinkedIn post options.
2. The 3 posts must not simply rewrite the same idea.
3. Create exactly one outreach message for every supplied outreach target.
4. Preserve each target's exact id and name.
5. Create one reusable warm relationship-first DM.
6. Create one light human follow-up that does not sound like a sales follow-up.
7. Create one SEO article title and useful outline.`;

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

      if (!Array.isArray(parsed.outreach_targets)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "AI did not return the outreach target list.",
          },
          { status: 500 }
        );
      }

      const expectedIds = new Set(
        dueTargets.map((target) =>
          String(target.id)
        )
      );

      const returnedIds = new Set(
        parsed.outreach_targets.map(
          (target: any) =>
            String(target?.id || "")
        )
      );

      if (
        expectedIds.size !== returnedIds.size ||
        [...expectedIds].some(
          (id) => !returnedIds.has(id)
        )
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              "AI did not return exactly the same outreach targets supplied by Ops.",
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

      const aiMessageByTargetId = new Map(
        parsed.outreach_targets.map(
          (target: any) => [
            String(target?.id || ""),
            String(target?.message || "").trim(),
          ]
        )
      );

      const enrichedOutreachTargets =
        dueTargets.map((target) => ({
          id: String(target.id),
          name:
            String(target.target_name || ""),
          company:
            target.company || "",
          role:
            target.role_title || "",
          linkedinUrl:
            target.linkedin_url || "",
          stage:
            target.stage || "connection",
          message:
            aiMessageByTargetId.get(
              String(target.id)
            ) || "",
        }));

     for (const target of enrichedOutreachTargets) {
  const firstName =
    target.name.trim().split(/\s+/)[0] || target.name;

  const currentMessage = String(target.message || "").trim();

  if (
    target.stage === "connection" &&
    firstName &&
    !currentMessage
      .toLowerCase()
      .includes(firstName.toLowerCase())
  ) {
    target.message =
      `Hi ${firstName} — ${currentMessage
        .replace(/^hi\s+[^,–—-]+[,–—-]?\s*/i, "")
        .trim()}`;
  }
}
      const missingMessage =
        enrichedOutreachTargets.find(
          (target) => !target.message
        );

      if (missingMessage) {
        return NextResponse.json(
          {
            success: false,
            error:
              `AI did not return a usable outreach message for ${missingMessage.name || "one target"}.`,
          },
          { status: 500 }
        );
      }

      const firstLinkedInPost =
        parsed.linkedin_posts?.[0]?.copy || "";

      const connectionMessages =
        enrichedOutreachTargets.map(
          (target) => target.message
        );

      const output = {
        ...parsed,
        outreach_targets:
          enrichedOutreachTargets,
        outreach_source:
          "growth_targets",
        outreach_target_count:
          enrichedOutreachTargets.length,
      };

      const { data, error } =
        await supabaseAdmin
          .from("growth_plans")
          .insert({
            organisation_id:
              tenant.organisationId,
            day_number: day,
            target: audience,
            linkedin_post:
              firstLinkedInPost,
            connection_messages:
              connectionMessages,
            dm_message:
              parsed.dm_message || "",
            follow_up_message:
              parsed.follow_up_message || "",
            seo_article:
              parsed.seo_article || {},
            raw_output: output,
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
        data: output,
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
  {
    generation: true,
    write: true,
  }
);
