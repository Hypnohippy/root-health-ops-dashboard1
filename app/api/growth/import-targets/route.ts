import { NextResponse } from "next/server";
import Papa from "papaparse";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

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
    "organization",
    "organisation",
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
    .filter(([key, value]) => {
      if (!value) return false;
      return !used.includes(key.trim().toLowerCase());
    })
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

    const parsed = Papa.parse<Record<string, any>>(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { success: false, error: parsed.errors[0].message },
        { status: 400 }
      );
    }

    const rows = parsed.data
      .map((row) => {
        const firstName = pick(row, ["First Name", "First name", "first_name"]);
        const lastName = pick(row, ["Last Name", "Last name", "last_name"]);

        const targetName =
          pick(row, ["Name", "Full Name", "Full name", "Contact Name"]) ||
          `${firstName} ${lastName}`.trim();

        const company = pick(row, [
          "Company",
          "Company Name",
          "Organisation",
          "Organization",
          "Account Name",
        ]);

        const roleTitle = pick(row, [
          "Job Title",
          "Title",
          "Role",
          "Position",
          "Headline",
        ]);

        const linkedinUrl = pick(row, [
          "LinkedIn",
          "LinkedIn URL",
          "Profile URL",
          "Person LinkedIn URL",
          "Linkedin Url",
        ]);

        return {
          target_name: targetName,
          company,
          role_title: roleTitle,
          linkedin_url: linkedinUrl,
          notes: buildNotes(row),
          stage: "connection",
          status: "active",
        };
      })
      .filter((row) => row.target_name);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid targets found. The CSV needs at least a name column." },
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
