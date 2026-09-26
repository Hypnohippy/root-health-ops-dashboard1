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

For stage "connection":
- This is the first light relationship touch.
- Give one plain-English reason for the connection so the recipient is not left thinking "and?"
- The reason should come from the organisation's real area of work, not from flattering or reciting the recipient's profile.
- No pitch.
- No offer.
- No call booking.
- No brochure.
- No detailed Root Health explanation.
- Do not tell the person what their own job is.
- Do not manufacture a personal reason for choosing them.
- Be warm, short, spoken and human.
- The message should sound like someone saying hello properly, not starting a sales sequence.
- It is fine to lightly acknowledge the awkwardness of LinkedIn outreach.
- Quiet confidence is better than clever copy.
- Keep under 300 characters.
- Do not say "thanks for accepting" because acceptance is not yet verified at this stage.

THE IDEAL STRUCTURE IS:
1. First name.
2. One simple sentence explaining roughly why you are connecting.
3. A warm disarming sentence that makes clear there is no immediate pitch.

THE TARGET FEEL IS:
"Hi Tom, I spend most of my time around workplace wellbeing, stress and recovery, so there's a fair chance we'll have a few things to talk about. No brochure today 😆 just saying hello properly."

This is the benchmark for warmth, clarity and confidence.
Do not copy it mechanically.
Vary the wording naturally across people.

GOOD ALTERNATIVES SHOULD FEEL LIKE:
- "Hi Tom, most of what I do sits around workplace wellbeing, stress and recovery, so I thought it made sense to say hello. No sales ambush from me 😆"
- "Hi Tom, I spend a lot of my time thinking about how organisations handle stress, recovery and wellbeing. Thought I'd say hello properly rather than arrive with a pitch."
- "Hi Tom, my work is mostly around workplace wellbeing and recovery, so we may well have a few things in common. No brochure attached 😆 just hello for now."

DO NOT:
- start with "I noticed"
- start with "I came across"
- compliment their background
- repeat their job title back to them
- explain their company to them
- ask for a call
- introduce the product in detail
- sound mysterious about why you are contacting them
- try too hard to be funny
For stage "day3_dm":
- Assume a connection request has already been sent, but do not claim they accepted unless the supplied context verifies that.
- Warm first proper hello.
- No pitch.
- No CV recital.
- No attempt to impress them with research.
- If acceptance is explicitly verified in supplied context, thanking them is natural.
- If acceptance is not verified, simply say hello.
- The message should sound as though a confident human typed it personally.
- It may gently disarm the expectation of a sales pitch.

Preferred style when acceptance IS verified:
"Hi Tom, thanks for accepting. I promise I'm not going to celebrate the connection by immediately sending you a brochure 😆 I'm here because I like good conversations with good people. Let's leave the sales bit for another day."

Do not copy this exact wording for everyone. Preserve the spirit and vary naturally.

For stage "day10_insight":
- If there has been no response, become a little lighter rather than more sales-focused.
- The aim is to put a small smile on a serious person's face.
- Never guilt them for not replying.
- Never say "just following up".
- Never say "bumping this".
- Never mention that they failed to respond.
- Do not introduce a pitch simply because this is a later message.
- A small piece of dry or self-deprecating humour is welcome.
- Keep it natural and brief.

Style examples:
"Hi Tom, keeping my promise — still no brochure 😆 Hope the week's treating you kindly."

"Hi Tom, thought I'd say hello again before LinkedIn turns us into two people who connected once and never actually spoke 😆"

Do not reuse these phrases repeatedly across different people.

For stage "day17_followup":
- Relevance may now enter the conversation naturally.
- Use verified context only.
- Mention at most one relevant aspect of their role, company or remit.
- Do not recite multiple job responsibilities.
- Do not flatter.
- Do not pitch aggressively.
- Ask for a view or thought only when it sounds natural.
- Root Health may now be mentioned softly if there is a genuine connection between the subject and the recipient.

Good style:
"Hi Tom, one thing I've been spending a lot of time on is how organisations deal with stress and recovery without turning wellbeing into another box to tick. Given your experience around HR and organisational change, I'd be interested in your take."

Again, do not copy this mechanically.

For a final or parked message:
- Leave gracefully.
- No guilt.
- No false urgency.
- No "last chance".
- No calendar link dumped into the message.
- A little humour is acceptable.
- Leave the door open.

Style:
"Hi Tom, I'll stop haunting your inbox after this one 😆 If there's ever a useful overlap between what you're doing and what we're building at Root, the door's open."

PERSONALISATION
- Use the recipient's first name naturally.
- Use company, role or notes only when they genuinely improve the conversation.
- Never use profile information merely to prove that research was done.
- One specific verified detail is better than five.
- If little verified information exists, write a good human message without pretending otherwise.
- Never invent a company, role, relationship, interest, post, opinion or personal fact.
- Never infer health information about the recipient.
- Never make clinical claims.
- Never turn a health-related clue into unsolicited personal-health targeting.

VARIETY
- Do not give all recipients the same sentence structure.
- Rotate naturally between:
  - warm/simple
  - dry humour
  - lightly cheeky
  - straightforward
  - sincere
- Avoid creating a new recognisable AI template.
- If names could be swapped between two messages without either sounding different, the personalisation is too weak when verified context exists.
- However, never invent context purely to make messages different.

BUSINESS FACTS
- Use real supplied business facts only.
- Use actual supplied target names.
- NEVER output placeholders.
- NEVER output bracketed placeholder text such as [Name], [topic], [field], [audience], [offer], [problem], [organisation], [specific point], or anything similar.
- Do not invent founder experiences.
- Do not invent customer results, testimonials, statistics, certifications or product features.
- No hype.
- No cringe.
- Avoid repetitive marketing formulas.

LINKEDIN CONTENT
- LinkedIn posts must be complete publishable drafts, not templates.
- Create three genuinely different creative directions.
- Do not make all three posts versions of the same argument.

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
