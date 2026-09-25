import type { ResponseLifecycle } from "@/lib/responseLifecycle";

export default function ResponseLifecycleDetails({ lifecycle, compact = false }: { lifecycle?: ResponseLifecycle | null; compact?: boolean }) {
  if (!lifecycle) return <p>Lifecycle unavailable. Refresh before taking action.</p>;
  return <div className="mt-2 text-xs text-slate-300">
    <div><b>Current state:</b> {lifecycle.label}</div>
    {!compact && <div><b>Last action:</b> {lifecycle.lastAction?.action.replaceAll("_", " ") || "None recorded"}{lifecycle.lastAction?.at ? ` — ${new Date(lifecycle.lastAction.at).toLocaleString()}` : ""}</div>}
    <div><b>Next action:</b> {lifecycle.nextAction || "None due"}</div>
    {(!compact || lifecycle.nextDueDate) && <div><b>Next due:</b> {lifecycle.nextDueDate ? new Date(lifecycle.nextDueDate).toLocaleString() : "Not scheduled"}</div>}
    {!compact && <>
      <div><b>Channel:</b> {lifecycle.channel || "Unknown"}</div>
      <div><b>Human action required:</b> {lifecycle.humanActionRequired ? "Yes" : "No"}</div>
      {lifecycle.blockedReason && <p>{lifecycle.blockedReason}</p>}
    </>}
  </div>;
}
