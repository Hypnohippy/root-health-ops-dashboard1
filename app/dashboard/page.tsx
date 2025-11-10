// app/dashboard/page.tsx

// get records from Airtable
async function getAirtableRecords(table: string) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    console.log("Missing Airtable env vars");
    return [];
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
      table
    )}?maxRecords=15&sort[0][field]=run_at&sort[0][direction]=desc`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.log("Airtable error:", await res.text());
    return [];
  }

  const data = await res.json();
  return data.records || [];
}

export default async function DashboardPage() {
  // your real table names
  const content = await getAirtableRecords("Content");
  const automations = await getAirtableRecords("Automations Log");
  const introducers = await getAirtableRecords("Introducers");

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        background: "#f1f5f9",
        color: "#0f172a",
      }}
    >
      <h1 st
