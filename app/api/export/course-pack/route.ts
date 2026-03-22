import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
  try {
    const { course, title } = await req.json();

    if (!course) {
      return NextResponse.json(
        { error: "Missing course" },
        { status: 400 }
      );
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

    const safeFileName = courseTitle
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
    <!--[if gte mso 9]>
    <xml>
      <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
      </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #0f172a;
        line-height: 1.5;
        margin: 32px;
      }
      h1 {
        font-size: 26px;
        margin: 0 0 8px 0;
        color: #0f172a;
      }
      h2 {
        font-size: 18px;
        margin: 26px 0 8px 0;
        color: #0f172a;
        border-bottom: 1px solid #dbe5f1;
        padding-bottom: 4px;
      }
      h3 {
        font-size: 15px;
        margin: 20px 0 6px 0;
        color: #0f172a;
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
      .soft {
        background: #f8fafc;
      }
      .green {
        background: #f0fdf4;
      }
      .blue {
        background: #eff6ff;
      }
      .purple {
        background: #f5f3ff;
      }
      .amber {
        background: #fffbeb;
      }
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
    <h1>${escapeHtml(courseTitle)}</h1>
    <div class="muted">Root Health Ops Course Pack</div>

    ${
      summary
        ? `
      <div class="card soft">
        <div class="label">Summary</div>
        <div>${nl2br(summary)}</div>
      </div>
    `
        : ""
    }

    ${
      intendedReader
        ? `
      <div class="card soft">
        <div class="label">Intended reader</div>
        <div>${nl2br(intendedReader)}</div>
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
          .map((item: unknown) => `<li>${escapeHtml(item)}</li>`)
          .join("")}
      </ul>
    `
        : ""
    }

    ${sections
      .map((section: any, index: number) => {
        const bullets = Array.isArray(section?.bullets) ? section.bullets : [];
        const sectionTitle = String(section?.title || `Module ${index + 1}`).trim();
        const sectionSummary = String(section?.summary || "").trim();
        const instructorNotes = String(section?.instructor_notes || "").trim();
        const deliverySteps = String(section?.delivery_steps || "").trim();
        const exercise = String(section?.exercise || "").trim();
        const reflectionPrompt = String(section?.reflection_prompt || "").trim();

        return `
        <div class="section">
          <h2>Module ${index + 1}: ${escapeHtml(sectionTitle)}</h2>

          ${
            sectionSummary
              ? `
            <div class="card soft">
              <div class="label">Module summary</div>
              <div>${nl2br(sectionSummary)}</div>
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
                  .map((item: unknown) => `<li>${escapeHtml(item)}</li>`)
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
              <div>${nl2br(instructorNotes)}</div>
            </div>
          `
              : ""
          }

          ${
            deliverySteps
              ? `
            <div class="card blue">
              <div class="label">Delivery steps</div>
              <div>${nl2br(deliverySteps)}</div>
            </div>
          `
              : ""
          }

          ${
            exercise
              ? `
            <div class="card purple">
              <div class="label">Practical exercise</div>
              <div>${nl2br(exercise)}</div>
            </div>
          `
              : ""
          }

          ${
            reflectionPrompt
              ? `
            <div class="card amber">
              <div class="label">Reflection prompt</div>
              <div>${nl2br(reflectionPrompt)}</div>
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
        ${nl2br(closingEncouragement)}
      </div>
    `
        : ""
    }

    <div class="footer">
      Generated by Root Health Ops
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
  } catch {
    return NextResponse.json(
      { error: "Failed to generate course pack" },
      { status: 500 }
    );
  }
}
