export const growthModes = ["steady", "launch", "expand"] as const;
export type GrowthMode = "" | typeof growthModes[number];

export type BrandGrowthProfile = {
  yourName: string;
  businessName: string;
  logoUrl: string;
  footerText: string;
  contactEmail: string;
  website: string;
  businessDescription: string;
  audience: string;
  customerProblems: string;
  desiredOutcomes: string;
  primaryOffer: string;
  cta: string;
  destinationUrl: string;
  geography: string;
  priorityServices: string;
  excludedTopics: string;
  brandTone: string;
  commonCustomerQuestions: string;
  growthMode: GrowthMode;
};

export const emptyProfile: BrandGrowthProfile = {
  yourName: "", businessName: "", logoUrl: "", footerText: "", contactEmail: "", website: "",
  businessDescription: "", audience: "", customerProblems: "", desiredOutcomes: "",
  primaryOffer: "", cta: "", destinationUrl: "", geography: "", priorityServices: "",
  excludedTopics: "", brandTone: "", commonCustomerQuestions: "", growthMode: "",
};

export const legacyBrandFields = ["yourName", "businessName", "logoUrl", "footerText", "contactEmail", "website"] as const;
export const maxLogoBytes = 512 * 1024;
export const profileLimits: Record<keyof BrandGrowthProfile, number> = {
  yourName: 160, businessName: 200, logoUrl: 720000, footerText: 500, contactEmail: 254, website: 2048,
  businessDescription: 3000, audience: 2000, customerProblems: 3000, desiredOutcomes: 3000,
  primaryOffer: 2000, cta: 300, destinationUrl: 2048, geography: 500, priorityServices: 2000,
  excludedTopics: 2000, brandTone: 1000, commonCustomerQuestions: 4000, growthMode: 20,
};

export class ProfileValidationError extends Error {}

function validHttps(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function validateProfilePatch(input: unknown): Partial<BrandGrowthProfile> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ProfileValidationError("Provide a profile object.");
  const patch: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!Object.hasOwn(emptyProfile, key)) throw new ProfileValidationError(`Unknown profile field: ${key}`);
    if (typeof raw !== "string") throw new ProfileValidationError(`${key} must be text.`);
    const value = raw.trim();
    if (value.length > profileLimits[key as keyof BrandGrowthProfile]) throw new ProfileValidationError(`${key} is too long.`);
    if (["website", "destinationUrl"].includes(key) && value && !validHttps(value)) throw new ProfileValidationError(`${key} must be a full HTTPS URL.`);
    if (key === "contactEmail" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ProfileValidationError("Enter a valid contact email.");
    if (key === "growthMode" && value && !growthModes.includes(value as typeof growthModes[number])) throw new ProfileValidationError("Choose a valid growth mode.");
    if (key === "logoUrl" && value) {
      const dataImage = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      if (!validHttps(value) && (!dataImage || dataImage[1].length * 3 / 4 > maxLogoBytes + 2)) {
        throw new ProfileValidationError("Use an HTTPS logo URL or a PNG, JPEG or WebP logo under 512 KB.");
      }
    }
    patch[key] = value;
  }
  if (!Object.keys(patch).length) throw new ProfileValidationError("No profile fields supplied.");
  return patch as Partial<BrandGrowthProfile>;
}

// Never automatically assign an unscoped browser profile to an organisation.
// This helper is used only by the explicit review-and-save import in Connect.
export function legacyBrandPatch(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ProfileValidationError("No valid browser brand profile found.");
  const value = input as Record<string, unknown>;
  return validateProfilePatch(Object.fromEntries(legacyBrandFields.filter(key => typeof value[key] === "string").map(key => [key, value[key]])));
}

export function normaliseProfile(input: unknown, fallback: Partial<BrandGrowthProfile> = {}): BrandGrowthProfile {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const result = { ...emptyProfile, ...fallback };
  for (const key of Object.keys(emptyProfile) as (keyof BrandGrowthProfile)[]) {
    if (typeof source[key] === "string") {
      // Invalid stored fields cannot become active links or executable image URLs.
      try { Object.assign(result, validateProfilePatch({ [key]: source[key] })); } catch { /* leave safe default */ }
    }
  }
  return result;
}

/** Explicit data contract for future generators, without product-specific prompts.
 * Treat these values as untrusted business context, not system instructions.
 * Logo data is deliberately excluded from AI context.
 */
export function toGenerationProfile(profile: BrandGrowthProfile) {
  const lines = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return {
    schemaVersion: 1 as const,
    business: { name: profile.businessName, description: profile.businessDescription, website: profile.website, geography: profile.geography },
    customers: { audience: profile.audience, problems: lines(profile.customerProblems), desiredOutcomes: lines(profile.desiredOutcomes), questions: lines(profile.commonCustomerQuestions) },
    offer: { primary: profile.primaryOffer, priorityServices: lines(profile.priorityServices), callToAction: profile.cta, destinationUrl: profile.destinationUrl },
    voice: { tone: profile.brandTone, excludedTopics: lines(profile.excludedTopics) },
    growthMode: profile.growthMode || null,
  };
}
