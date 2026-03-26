import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value: unknown) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function toUkEnglish(text: string): string {
  return text
    .replace(/\bcolor\b/gi, "colour")
    .replace(/\bcolors\b/gi, "colours")
    .replace(/\bcolored\b/gi, "coloured")
    .replace(/\bcoloring\b/gi, "colouring")
    .replace(/\borganize\b/gi, "organise")
    .replace(/\borganizes\b/gi, "organises")
    .replace(/\borganized\b/gi, "organised")
    .replace(/\borganizing\b/gi, "organising")
    .replace(/\borganization\b/gi, "organisation")
    .replace(/\borganizations\b/gi, "organisations")
    .replace(/\borganizational\b/gi, "organisational")
    .replace(/\bpersonalize\b/gi, "personalise")
    .replace(/\bpersonalized\b/gi, "personalised")
    .replace(/\bpersonalizing\b/gi, "personalising")
    .replace(/\bemphasize\b/gi, "emphasise")
    .replace(/\bemphasized\b/gi, "emphasised")
    .replace(/\bemphasizing\b/gi, "emphasising")
    .replace(/\banalyze\b/gi, "analyse")
    .replace(/\banalyzed\b/gi, "analysed")
    .replace(/\banalyzing\b/gi, "analysing")
    .replace(/\bbehavior\b/gi, "behaviour")
    .replace(/\bbehaviors\b/gi, "behaviours")
    .replace(/\bbehavioral\b/gi, "behavioural")
    .replace(/\bcenter\b/gi, "centre")
    .replace(/\bcenters\b/gi, "centres")
    .replace(/\bcentered\b/gi, "centred")
    .replace(/\bcentering\b/gi, "centring")
    .replace(/\bmodeling\b/gi, "modelling")
    .replace(/\bmodeled\b/gi, "modelled")
    .replace(/\btraveler\b/gi, "traveller")
    .replace(/\btravelers\b/gi, "travellers")
    .replace(/\bcounseling\b/gi, "counselling")
    .replace(/\bcounselor\b/gi, "counsellor")
    .replace(/\bcounselors\b/gi, "counsellors")
    .replace(/\bdefense\b/gi, "defence")
    .replace(/\boffense\b/gi, "offence")
    .replace(/\bpracticing\b/gi, "practising");
}

async function imageUrlToDataUri(url: string): Promise<string> {
  try {
    if (!url) return "";

    const res = await fetch(url);
    if (!res.ok) return "";

    const contentType = res.headers.get("content-type") || "image/png";
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return `data:${contentType};base64,${base64}`;
  } catch {
    return "";
  }
}

function formatNumberedLines(text: string) {
  const safe = toUkEnglish(String(text || "").trim());
  if (!safe) return "";

  const parts = safe
    .split(/\s(?=\d+\.\s)/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return `<div>${nl2br(safe)}</div>`;
  }

  return `
    <ol style="margin:8px 0 0 20px; padding:0;">
      ${parts
        .map((item) => {
          const cleaned = item.replace(/^\d+\.\s*/, "").trim();
          return `<li style="margin:6px 0;">${nl2br(cleaned)}</li>`;
        })
        .join("")}
    </ol>
  `;
}

export async function POST(req: Request) {
  try {
    const { course, title, organisationId } = await req.json();

    if (!course) {
      return NextResponse.json(
        { error: "Missing course" },
        { status: 400 }
      );
    }

    let brandName = "Course Pack";
    let brandColor = "#10b981";
    let logoUrl = "";
    let logoDataUri = "";

    if (organisationId) {
      const { data: org } = await supabaseAdmin
        .from("organisations")
        .select("name, brand_name, brand_primary_color, brand_logo_url")
        .eq("id", organisationId)
        .maybeSingle();

      if (org) {
        brandName = String(
          org.brand_name || org.name || "Course Pack"
        ).trim();
        brandColor = String(
          org.brand_primary_color || "#10b981"
        ).trim();
        logoUrl = String(org.brand_logo_url || "").trim();
        logoDataUri = await imageUrlToDataUri(logoUrl);
      }
    }

    const courseTitle = String(
      title || course?.title || "Course Pack"
    ).trim();

    const summary = String(course?.summary || "").trim();
    const intendedReader = String(course?.intended_reader || "").trim();
    const estimatedLearningTime = String(
      course?.estimated_learning_time || ""
    ).trim();
    const practitionerLevel = String(
      course?.practitioner_level || ""
    ).trim();
    const learningOutcomes = Array.isArray(course?.learning_outcomes)
      ? course.learning_outcomes
      : [];
    const sections = Array.isArray(course?.sections) ? course.sections : [];
    const closingEncouragement = String(
      course?.closing_encouragement || ""
    ).trim();

    const safeFileName =
      courseTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "course-pack";

    const html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(courseTitle)}</title>
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #0f172a;
        line-height: 1.55;
        margin: 28px;
      }
      h1 {
        font-size: 26px;
        margin: 0;
        color: #0f172a;
      }
      h2 {
        font-size: 18px;
        margin: 30px 0 10px 0;
        color: ${brandColor};
        border-bottom: 1px solid #dbe5f1;
        padding-bottom: 5px;
      }
      h3 {
        font-size: 14px;
        margin: 0 0 8px 0;
        color: #0f172a;
      }
      .muted {
        color: #475569;
        margin-bottom: 18px;
      }
      .section {
  margin-top: 36px;
  page-break-inside: avoid;
}
     .card {
  border: 1px solid #dbe5f1;
  padding: 16px 18px;
  margin: 18px 0;
  border-radius: 10px;
}
      .soft { background: #f8fafc; }
      .green { background: #f0fdf4; }
      .blue { background: #eff6ff; }
      .purple { background: #f5f3ff; }
      .amber { background: #fffbeb; }
      .sky { background: #f0f9ff; }
      .fuchsia { background: #fdf4ff; }
      .indigo { background: #eef2ff; }
      .teal { background: #f0fdfa; }
      ul {
        margin: 8px 0 0 20px;
        padding: 0;
      }
      li {
        margin: 5px 0;
      }
      .label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 8px;
        letter-spacing: 0.04em;
      }
      .footer {
        margin-top: 30px;
        color: #475569;
      }
      .meta-grid {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
        margin-bottom: 12px;
      }
      .meta-grid td {
        width: 50%;
        vertical-align: top;
        padding-right: 10px;
      }
      .spaced-text {
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <table style="width:100%; border-collapse:collapse; margin-bottom:18px;">
      <tr>
        ${
          logoDataUri
            ? `
            <td style="width:180px; vertical-align:middle; padding-right:12px;">
              <img
                src="${logoDataUri}"
                alt="Logo"
                style="max-height:60px; max-width:160px; width:auto; height:auto; display:block;"
                width="160"
              />
            </td>
          `
            : ""
        }
        <td style="vertical-align:middle;">
          <h1>${escapeHtml(courseTitle)}</h1>
          <div style="color:${brandColor}; font-weight:600;">
            ${escapeHtml(brandName)}
          </div>
        </td>
      </tr>
    </table>

    <div class="muted">Course Pack</div>

    ${
      summary
        ? `
      <div class="card soft">
        <div class="label">Summary</div>
        <div class="spaced-text">${nl2br(toUkEnglish(summary))}</div>
      </div>
    `
        : ""
    }

    ${
      intendedReader || estimatedLearningTime || practitionerLevel
        ? `
      <table class="meta-grid">
        <tr>
          <td>
            ${
              intendedReader
                ? `
              <div class="card soft">
                <div class="label">Intended reader</div>
                <div class="spaced-text">${nl2br(toUkEnglish(intendedReader))}</div>
              </div>
            `
                : ""
            }
          </td>
          <td>
            ${
              estimatedLearningTime
                ? `
              <div class="card soft">
                <div class="label">Estimated learning time</div>
                <div class="spaced-text">${nl2br(toUkEnglish(estimatedLearningTime))}</div>
              </div>
            `
                : ""
            }
            ${
              practitionerLevel
                ? `
              <div class="card soft">
                <div class="label">Practitioner level</div>
                <div class="spaced-text">${nl2br(toUkEnglish(practitionerLevel))}</div>
              </div>
            `
                : ""
            }
          </td>
        </tr>
      </table>
    `
        : ""
    }

    ${
      learningOutcomes.length
        ? `
      <h2>Learning outcomes</h2>
      <ul>
        ${learningOutcomes
          .map(
            (item: unknown) =>
              `<li>${escapeHtml(toUkEnglish(String(item || "")))}</li>`
          )
          .join("")}
      </ul>
    `
        : ""
    }

    ${sections
      .map((section: any, index: number) => {
        const bullets = Array.isArray(section?.bullets) ? section.bullets : [];
        const sectionTitle = String(
          section?.title || `Module ${index + 1}`
        ).trim();
        const sectionSummary = String(section?.summary || "").trim();
        const mainPoints = String(section?.main_points || "").trim();
        const instructorNotes = String(section?.instructor_notes || "").trim();
        const facilitatorScript = String(
          section?.facilitator_script || ""
        ).trim();
        const facilitatorDeepTeach = String(
  section?.facilitator_deep_teach || ""
).trim();
        const facilitatorEliteDeepTeach = String(
  section?.facilitator_elite_deep_teach || ""
).trim();
        const deliverySteps = String(section?.delivery_steps || "").trim();
        const exercise = String(section?.exercise || "").trim();
        const exerciseFacilitatorGuidance = String(
          section?.exercise_facilitator_guidance || ""
        ).trim();
        const reflectionPrompt = String(
          section?.reflection_prompt || ""
        ).trim();
        const reviewQuestions = Array.isArray(section?.review_questions)
          ? section.review_questions
          : [];
        const followUpPractice = String(
          section?.follow_up_practice || ""
        ).trim();

        return `
        <div class="section">
  <div style="background:${brandColor}; color:white; padding:10px 14px; border-radius:6px; margin-bottom:12px;">
    <strong>Module ${index + 1}</strong>
  </div>
          <h2>Module ${index + 1}: ${escapeHtml(
            toUkEnglish(sectionTitle)
          )}</h2>

          ${
            sectionSummary
              ? `
            <div class="card soft">
              <div class="label">Module summary</div>
              <div class="spaced-text">${nl2br(toUkEnglish(sectionSummary))}</div>
            </div>
          `
              : ""
          }

          ${
            bullets.length
              ? `
            <div class="card">
              <div class="label">Teaching points</div>
              <ul>
                ${bullets
                  .map(
                    (item: unknown) =>
                      `<li>${escapeHtml(toUkEnglish(String(item || "")))}</li>`
                  )
                  .join("")}
              </ul>
            </div>
          `
              : ""
          }

          ${
            mainPoints
              ? `
            <div class="card blue">
              <div class="label">Main points for the teacher</div>
              <div class="spaced-text">${nl2br(toUkEnglish(mainPoints))}</div>
            </div>
          `
              : ""
          }

          ${
            instructorNotes
              ? `
            <div class="card green">
              <div class="label">Instructor notes</div>
              <div class="spaced-text">${nl2br(toUkEnglish(instructorNotes))}</div>
            </div>
          `
              : ""
          }

          ${
            facilitatorScript
              ? `
            <div class="card indigo">
              <div class="label">Facilitator script</div>
              <div class="spaced-text">${nl2br(toUkEnglish(facilitatorScript))}</div>
            </div>
          `
              : ""
          }
         ${
  facilitatorDeepTeach
    ? `
  <div class="card green">
    <div class="label">Facilitator deep teach</div>
    <div class="spaced-text">${nl2br(toUkEnglish(facilitatorDeepTeach))}</div>
  </div>
`
    : ""
}

${
  facilitatorEliteDeepTeach
    ? `
  <div class="card blue">
    <div class="label">Facilitator elite deep teach</div>
    <div class="spaced-text">${nl2br(toUkEnglish(facilitatorEliteDeepTeach))}</div>
  </div>
`
    : ""
}
      facilitatorDeepTeach
        .replace(/Concept teaching notes/gi, "\n\n— CONCEPT TEACHING NOTES —\n")
        .replace(/Step-by-step delivery/gi, "\n\n— STEP-BY-STEP DELIVERY —\n")
        .replace(/Exact wording examples/gi, "\n\n— EXACT WORDING —\n")
        .replace(/Worked example/gi, "\n\n— WORKED EXAMPLE —\n")
        .replace(/Common pitfalls/gi, "\n\n— COMMON PITFALLS —\n")
        .replace(/Debrief guide/gi, "\n\n— DEBRIEF GUIDE —\n")
    )
  )}
</div>
`
    : ""
}

          ${
            deliverySteps
              ? `
            <div class="card blue">
              <div class="label">Teaching flow (step-by-step)</div>
      
              ${formatNumberedLines(deliverySteps)}
            </div>
          `
              : ""
          }

          ${
            exercise
              ? `
            <div class="card purple">
              <div class="label">Practical exercise</div>
              <div class="spaced-text">${nl2br(toUkEnglish(exercise))}</div>
            </div>
          `
              : ""
          }

          ${
            exerciseFacilitatorGuidance
              ? `
            <div class="card teal">
              <div class="label">Exercise facilitator guidance</div>
              <div class="spaced-text">${nl2br(
                toUkEnglish(exerciseFacilitatorGuidance)
              )}</div>
            </div>
          `
              : ""
          }

          ${
            reflectionPrompt
              ? `
            <div class="card amber">
              <div class="label">Reflection prompt</div>
              <div class="spaced-text">${nl2br(toUkEnglish(reflectionPrompt))}</div>
            </div>
          `
              : ""
          }

          ${
            reviewQuestions.length
              ? `
            <div class="card sky">
              <div class="label">Review questions</div>
              <ul>
                ${reviewQuestions
                  .map(
                    (item: unknown) =>
                      `<li>${escapeHtml(toUkEnglish(String(item || "")))}</li>`
                  )
                  .join("")}
              </ul>
            </div>
          `
              : ""
          }

          ${
            followUpPractice
              ? `
            <div class="card fuchsia">
              <div class="label">Follow-up practice</div>
              <div class="spaced-text">${nl2br(toUkEnglish(followUpPractice))}</div>
            </div>
          `
              : ""
          }
        </div>
      `;
      })
      .join("")}

    ${
      closingEncouragement
        ? `
      <h2>Closing encouragement</h2>
      <div class="card green">
        <div class="spaced-text">${nl2br(toUkEnglish(closingEncouragement))}</div>
      </div>
    `
        : ""
    }

    <div class="footer">
      Generated for ${escapeHtml(brandName)}
    </div>
  </body>
</html>
`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "application/msword; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFileName}.doc"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to generate course pack" },
      { status: 500 }
    );
  }
}
