import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function parseCSV(text: string) {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((row) => row.trim().length > 0);

  const headers = rows[0].split(",").map((h) => h.trim());

  return rows.slice(1).map((row) => {
    const values = row.split(",").map((v) => v.trim());
    const obj: Record<string, string> = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] || "";
    });

    return obj;
  });
}

function pick(row: Record<string, any>, possibleNames: string[]) {
  const keys = Object.keys(row);

  for (const name of possibleNames) {
    const foundKey = keys.find(
      (key) => key.trim().toLowerCase() === name.toLowerCase()
    );

    if (foundKey && row[foundKey]) {
      return String(row[foundKey]).trim();
    }
  }

  return "";
}

function buildNotes(row: Record<string, any>) {
  const used = [
    "name",
    "full name",
    "first name",
    "last name",
    "company",
    "company name",
    "organisation",
    "organization",
    "job title",
    "title",
    "role",
    "position",
    "linkedin",
    "linkedin url",
    "profile url",
    "person linkedin url",
  ];

  return Object.entries(row)
    .filter(([key, value]) => value && !used.includes(key.trim().toLowerCase()))
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No CSV file uploaded." },
        { status: 400 }
      );
    }

    const text = await file.text();
    const parsedRows = parseCSV(text);

    const rows = parsedRows
      .map((row) => {
        const firstName = pick(row, ["First Name", "First name", "first_name"]);
        const lastName = pick(row, ["Last Name", "Last name", "last_name"]);

        const targetName =
          pick(row, ["Name", "Full Name", "Full name", "Contact Name"]) ||
          `${firstName} ${lastName}`.trim();

        return {
  target_name: targetName,
  company: pick(row, [
    "Company",
    "Company Name",
    "Organisation",
    "Organization",
    "Account Name",
  ]),
  role_title: pick(row, [
    "Job Title",
    "Title",
    "Role",
    "Position",
    "Headline",
  ]),
  linkedin_url: pick(row, [
    "LinkedIn",
    "LinkedIn URL",
    "Profile URL",
    "Person LinkedIn URL",
    "Linkedin Url",
  ]),
  notes: buildNotes(row),
  stage: "connection",
  status: "active",
  lead_quality: "unreviewed",
};
      })
      .filter((row) => row.target_name);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid targets found. The CSV needs a name column.",
        },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("growth_targets").insert(rows);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imported: rows.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
