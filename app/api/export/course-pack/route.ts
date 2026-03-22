import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { course } = await req.json();

    if (!course) {
      return NextResponse.json({ error: "Missing course" }, { status: 400 });
    }

    const {
      title,
      summary,
      learning_outcomes,
      sections = [],
    } = course;

    let content = "";

    content += `COURSE: ${title}\n\n`;

    if (summary) {
      content += `SUMMARY\n${summary}\n\n`;
    }

    if (Array.isArray(learning_outcomes)) {
      content += `LEARNING OUTCOMES\n`;
      learning_outcomes.forEach((o: string) => {
        content += `• ${o}\n`;
      });
      content += `\n`;
    }

    sections.forEach((section: any, index: number) => {
      content += `MODULE ${index + 1}: ${section.title}\n\n`;

      if (section.summary) {
        content += `Module Summary:\n${section.summary}\n\n`;
      }

      if (section.instructor_notes) {
        content += `Instructor Notes:\n${section.instructor_notes}\n\n`;
      }

      if (section.delivery_steps) {
        content += `Delivery Steps:\n${section.delivery_steps}\n\n`;
      }

      if (section.exercise) {
        content += `Exercise:\n${section.exercise}\n\n`;
      }

      if (section.reflection_prompt) {
        content += `Reflection:\n${section.reflection_prompt}\n\n`;
      }

      content += `-----------------------------\n\n`;
    });

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="course-pack.txt"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to generate course pack" }, { status: 500 });
  }
}
