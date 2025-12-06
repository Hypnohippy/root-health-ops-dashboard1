
// app/api/org-setup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// Helper to safely read strings
function getString(formData: FormData, key: string, fallback = ""): string {
const v = formData.get(key);
return typeof v === "string" ? v.trim() : fallback;
}

// Basic slugify
function slugify(input: string): string {
return input
.toLowerCase()
.trim()
.replace(/[^a-z0-9]+/g, "-")
.replace(/^-+|-+$/g, "")
.slice(0, 60);
}

export async function POST(req: NextRequest) {
try {
const formData = await req.formData();

const orgName = getString(formData, "orgName");
if (!orgName) {
return NextResponse.json(
{ error: "orgName is required" },
{ status: 400 }
);
}

const rawSlug = getString(formData, "orgSlug");
const industry = getString(formData, "industry");
const orgSize = getString(formData, "orgSize");
const website = getString(formData, "website");

const primaryColor = getString(formData, "primaryColor", "#2563eb");
const secondaryColor = getString(formData, "secondaryColor", "#0f172a");
const accentColor = getString(formData, "accentColor", "#f97316");
const brandTone = getString(formData, "brandTone", "warm");

const ownerName = getString(formData, "ownerName");
const ownerRole = getString(formData, "ownerRole", "Lead therapist");
const inviteEmails = getString(formData, "inviteEmails");

const postingFrequency = getString(formData, "postingFrequency", "medium");
const goalsRaw = getString(formData, "goals", "[]");
const contentTypesRaw = getString(formData, "contentTypes", "[]");

let goals: string[] = [];
let contentTypes: string[] = [];

try {
goals = JSON.parse(goalsRaw || "[]");
} catch {
goals = [];
}

try {
contentTypes = JSON.parse(contentTypesRaw || "[]");
} catch {
contentTypes = [];
}

// Social prefs (we can use later for Connect / social_accounts)
const connectFacebook = getString(formData, "connectFacebook") === "true";
const connectInstagram = getString(formData, "connectInstagram") === "true";
const connectTiktok = getString(formData, "connectTiktok") === "true";
const connectLinkedin = getString(formData, "connectLinkedin") === "true";
const connectGoogle = getString(formData, "connectGoogle") === "true";
const connectEmailNewsletter =
getString(formData, "connectEmailNewsletter") === "true";
const connectWhatsApp = getString(formData, "connectWhatsApp") === "true";

const channelPrefs = {
facebook: connectFacebook,
instagram: connectInstagram,
tiktok: connectTiktok,
linkedin: connectLinkedin,
google_business: connectGoogle,
email_newsletter: connectEmailNewsletter,
whatsapp: connectWhatsApp,
};

// Make sure we have a slug
const slug = rawSlug || slugify(orgName);

// 👇 TODO (optional): get the CURRENT USER ID from your auth
// If you already have a way to get the user id in your other routes,
// paste that logic here and set ownerUserId accordingly.
const ownerUserId: string | null = null;

// We'll generate an org id so we can use it for storage paths
const orgId = crypto.randomUUID();

// 1) Create / update organisation row
// Adjust column names to match your schema if they differ.
const { data: org, error: orgError } = await supabaseAdmin
.from("organisations")
.upsert(
[
{
id: orgId,
name: orgName,
slug,
industry,
size: orgSize,
website,
primary_color: primaryColor,
secondary_color: secondaryColor,
accent_color: accentColor,
brand_tone: brandTone,
posting_frequency: postingFrequency,
goals,
content_types: contentTypes,
// Uncomment if you have this column:
// channel_preferences: channelPrefs,
// Uncomment if you have owner_id column:
// owner_id: ownerUserId,
},
],
{ onConflict: "id" }
)
.select("*")
.single();

if (orgError || !org) {
console.error("orgError", orgError);
return NextResponse.json(
{ error: "Failed to insert organisation", details: orgError?.message },
{ status: 500 }
);
}

// 2) Upload logo (if provided)
const logoEntry = formData.get("logo");
let logoUrl: string | null = null;

if (logoEntry && logoEntry instanceof File) {
const logo = logoEntry as File;
const ext =
logo.name.includes(".") ? logo.name.split(".").pop() : "png";
const path = `${org.id}/logo.${ext}`;

const { data: logoUpload, error: logoError } = await supabaseAdmin.storage
.from("org-logos")
.upload(path, logo, {
upsert: true,
contentType: logo.type || "image/png",
});

if (logoError) {
console.error("logoError", logoError);
} else if (logoUpload) {
const {
data: { publicUrl },
} = supabaseAdmin.storage.from("org-logos").getPublicUrl(logoUpload.path);
logoUrl = publicUrl;

// Save logo URL to org row
await supabaseAdmin
.from("organisations")
.update({ logo_url: logoUrl })
.eq("id", org.id);
}
}

// 3) Upload media files (if any) + optional media table records
const mediaFiles: { file: File; key: string }[] = [];
for (const [key, value] of formData.entries()) {
if (key.startsWith("media_") && value instanceof File) {
mediaFiles.push({ file: value, key });
}
}

const uploadedMedia: { path: string; url: string | null }[] = [];

for (const { file } of mediaFiles) {
try {
const safeName = file.name.replace(/[^a-z0-9.\-_]+/gi, "_");
const storagePath = `${org.id}/${Date.now()}-${safeName}`;

const { data: uploadData, error: mediaError } = await supabaseAdmin
.storage
.from("org-media")
.upload(storagePath, file, {
contentType: file.type || "application/octet-stream",
});

if (mediaError || !uploadData) {
console.error("mediaError", mediaError);
continue;
}

const {
data: { publicUrl },
} = supabaseAdmin.storage
.from("org-media")
.getPublicUrl(uploadData.path);

uploadedMedia.push({ path: uploadData.path, url: publicUrl });

// OPTIONAL: if you have a `media` table, we can record each file:
// await supabaseAdmin.from("media").insert({
// organisation_id: org.id,
// storage_path: uploadData.path,
// public_url: publicUrl,
// mime_type: file.type,
// });
} catch (err) {
console.error("Unexpected media upload error", err);
}
}

// 4) OPTIONAL: create owner membership row
// If you have a members / organisation_members table and ownerUserId:
// if (ownerUserId) {
// await supabaseAdmin.from("organisation_members").upsert(
// [
// {
// organisation_id: org.id,
// user_id: ownerUserId,
// role: "owner",
// display_name: ownerName || null,
// title: ownerRole || null,
// },
// ],
// { onConflict: "organisation_id,user_id" }
// );
// }

// 5) OPTIONAL: queue invites for inviteEmails (you can split and insert into an invites table)
// const emails = inviteEmails
// .split(/[\n,]+/)
// .map((e) => e.trim())
// .filter(Boolean);
// if (emails.length > 0) {
// await supabaseAdmin.from("organisation_invites").insert(
// emails.map((email) => ({
// organisation_id: org.id,
// email,
// invited_by: ownerUserId,
// }))
// );
// }

return NextResponse.json(
{
organisation: {
id: org.id,
name: org.name,
slug: org.slug,
logo_url: logoUrl ?? org.logo_url ?? null,
},
media: uploadedMedia,
channelPrefs,
},
{ status: 200 }
);
} catch (err: any) {
console.error("org-setup unexpected error", err);
return NextResponse.json(
{ error: "Unexpected error in org-setup", details: err?.message },
{ status: 500 }
);
}
}

