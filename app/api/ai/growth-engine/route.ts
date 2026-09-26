import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isGrowthTargetDue } from "@/lib/growthOutreach";

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

      const { data: targets, error: targetsError } =
        await supabaseAdmin
          .from("growth_targets")
          .select(
            "id,target_name,company,role_title,linkedin_url,stage,status,lead_quality,notes,reply_status,reply_notes,deal_stage,created_at,last_action_at"
          )
          .eq("organisation_id", tenant.organisationId)
          .eq("status", "active")
          .order("created_at", {
            ascending: false,
          });

      if (targetsError) {
        return NextResponse.json(
          {
            success: false,
            error: targetsError.message,
          },
          { status: 500 }
        );
      }

      const dueTargets = (targets || [])
        .filter(isGrowthTargetDue)
        .filter(
          (target) =>
            !target.lead_quality ||
            target.lead_quality === "unreviewed" ||
            target.lead_quality === "valid"
        )
        .slice(0, 10);

      const outreachContext = dueTargets.map((target) => ({
        id: target.id,
        name: target.target_name || "",
        company: target.company || "",
        role: target.role_title || "",
        stage: target.stage || "connection",
        notes: target.notes || "",
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
- Use the real supplied business facts.
- Use the actual outreach target names supplied above.
- NEVER output placeholders.
- NEVER output bracketed placeholder text such as [Name], [topic], [field], [audience], [offer], [problem], [organisation], [specific point], or anything similar.
- If a target has no company, role or notes, write naturally around the missing detail.
- Never invent a company, role, fact, post, interest or relationship.
- Do not invent lived founder experiences.
- Do not invent customer results, testimonials, statistics, certifications or product features.
- No hype.
- No cringe.
- No emojis.
- UK spelling.
- Human, thoughtful, useful and natural.
- Avoid repetitive marketing formulas.
- LinkedIn posts must be complete publishable drafts, not templates.
- Each outreach message must be personalised to the named target.
- For connection-stage targets, keep the message under 300 characters.
- For later-stage targets, keep the message concise and natural.
- Do not default to vague phrases such as "your current priorities caught my attention" unless actual supplied context supports that statement.
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
  "dm_message": "complete reusable post-connection DM with no placeholders",
  "follow_up_message": "complete reusable follow-up with no placeholders",
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
5. Create one reusable post-connection DM.
6. Create one soft follow-up.
7. Create one SEO article title and useful outline.
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
            target.target_name || "",
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
