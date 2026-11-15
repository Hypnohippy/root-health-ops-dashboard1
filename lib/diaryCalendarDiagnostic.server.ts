import { DIARY_CALENDAR_DIAGNOSTIC_BRANCH, DIARY_CALENDAR_DIAGNOSTIC_ORGANISATION_ID } from "@/lib/diaryGoogleCalendar.server";

export function isDiaryCalendarDiagnosticEnabled() {
  return process.env.VERCEL_ENV === "preview"
    && process.env.VERCEL_GIT_COMMIT_REF === DIARY_CALENDAR_DIAGNOSTIC_BRANCH;
}

export function isDiaryCalendarDiagnosticOrganisation(organisationId: string) {
  return organisationId === DIARY_CALENDAR_DIAGNOSTIC_ORGANISATION_ID;
}
