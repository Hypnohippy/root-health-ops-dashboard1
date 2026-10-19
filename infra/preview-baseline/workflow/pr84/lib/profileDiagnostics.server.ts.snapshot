// Log only diagnostic fields, never the raw object (which may contain request
// headers, sessions, submitted profiles or Postgres failing-row contents).
export function logProfileFailure(stage: string, error: unknown) {
  const source = error && typeof error === "object" ? error as Record<string, unknown> : { message: error };
  const clean = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    let text = value;
    for (const [key, secret] of Object.entries(process.env)) {
      if (secret && /KEY|SECRET|TOKEN|PASSWORD|COOKIE/i.test(key)) text = text.split(secret).join("[redacted]");
    }
    return text
      .replace(/Failing row contains[\s\S]*/gi, "Failing row contains [redacted]")
      .replace(/Key \([^)]+\)=\([\s\S]*?\)/gi, "Key value [redacted]")
      .replace(/profile\s*[:=][\s\S]*/gi, "profile [redacted]")
      .replace(/(?:authorization|cookie|access_token|refresh_token|service_role_key|password)\s*[:=][\s\S]*/gi, "[redacted credentials]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted token]")
      .replace(/https?:\/\/[^\s]+/gi, "[redacted URL]")
      .replace(/'[^']*'/g, "'[redacted value]'")
      .replace(/"[^"]*"/g, '"[redacted value]"')
      .slice(0, 1500);
  };
  console.error("[organisation-profile] failure", {
    stage, message: clean(source.message), code: clean(source.code),
    details: clean(source.details), hint: clean(source.hint),
  });
}
