import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { importTargets } from "@/lib/targetImport.server";
import { parseTargetCSV } from "@/lib/targetImport";

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

export const POST = withTenantRoute(async function POST(req: Request, tenant) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No CSV file uploaded." },
        { status: 400 }
      );
    }

    if (file.size > 2_000_000) return NextResponse.json({ success: false, error: "CSV must be under 2 MB." }, { status: 400 });
    const text = await file.text();
    const parsedRows = parseTargetCSV(text);

    const rows = parsedRows
      .map((row) => {
        const firstName = pick(row, ["First Name", "First name", "first_name"]);
        const lastName = pick(row, ["Last Name", "Last name", "last_name"]);

        const targetName =
          pick(row, ["Name", "Full Name", "Full name", "Contact Name"]) ||
          `${firstName} ${lastName}`.trim();

        return {
  email: pick(row, ["Email", "Email address", "Work email"]),
  source_type: "csv_import",
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
  notes: `CSV source: ${file.name}\n${buildNotes(row)}`,
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

    if (rows.length > 1000) return NextResponse.json({ success: false, error: "Import at most 1,000 rows at a time." }, { status: 400 });
    const result = await importTargets(tenant.organisationId, rows);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}, { generation: false, write: true });
