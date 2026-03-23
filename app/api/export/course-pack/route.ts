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

    .replace(/\blicense\b/gi, "licence")
    .replace(/\blicensed\b/gi, "licensed")

    .replace(/\bdefense\b/gi, "defence")
    .replace(/\boffense\b/gi, "offence")

    .replace(/\bpractice session\b/gi, "practise session")
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
        line-height: 1.5;
        margin: 32px;
      }
      h1 {
        font-size: 26px;
        margin: 0;
        color: #0f172a;
      }
      h2 {
        font-size: 18px;
        margin: 26px 0 8px 0;
        color: ${brandColor};
        border-bottom: 1px solid #dbe5f1;
        padding-bottom: 4px;
      }
      .muted {
        color: #475569;
        margin-bottom: 20px;
      }
      .section {
        margin-top: 28px;
        page-break-inside: avoid;
      }
      .card {
        border: 1px solid #dbe5f1;
        padding: 12px 14px;
        margin: 10px 0;
        border-radius: 8px;
      }
      .soft { background: #f8fafc; }
      .green { background: #f0fdf4; }
      .blue { background: #eff6ff; }
      .purple { background: #f5f3ff; }
      .amber { background: #fffbeb; }
      ul {
        margin: 8px 0 8px 20px;
      }
      li {
        margin: 4px 0;
      }
      .label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 6px;
        letter-spacing: 0.04em;
      }
      .footer {
        margin-top: 28px;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
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
        <div>${nl2br(toUkEnglish(summary))}</div>
      </div>
    `
        : ""
    }

    ${
      intendedReader
        ? `
      <div class="card soft">
        <div class="label">Intended reader</div>
        <div>${nl2br(toUkEnglish(intendedReader))}</div>
      </div>
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
        const instructorNotes = String(section?.instructor_notes || "").trim();
        const deliverySteps = String(section?.delivery_steps || "").trim();
        const exercise = String(section?.exercise || "").trim();
        const reflectionPrompt = String(
          section?.reflection_prompt || ""
        ).trim();

        return `
        <div class="section">
          <h2>Module ${index + 1}: ${escapeHtml(toUkEnglish(sectionTitle))}</h2>

          ${
            sectionSummary
              ? `
            <div class="card soft">
              <div class="label">Module summary</div>
              <div>${nl2br(toUkEnglish(sectionSummary))}</div>
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
            instructorNotes
              ? `
            <div class="card green">
              <div class="label">Instructor notes</div>
              <div>${nl2br(toUkEnglish(instructorNotes))}</div>
            </div>
          `
              : ""
          }

          ${
            deliverySteps
              ? `
            <div class="card blue">
              <div class="label">Delivery steps</div>
              <div>${nl2br(toUkEnglish(deliverySteps))}</div>
            </div>
          `
              : ""
          }

          ${
            exercise
              ? `
            <div class="card purple">
              <div class="label">Practical exercise</div>
              <div>${nl2br(toUkEnglish(exercise))}</div>
            </div>
          `
              : ""
          }

          ${
            reflectionPrompt
              ? `
            <div class="card amber">
              <div class="label">Reflection prompt</div>
              <div>${nl2br(toUkEnglish(reflectionPrompt))}</div>
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
        ${nl2br(toUkEnglish(closingEncouragement))}
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
