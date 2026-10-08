import { assessConnectionCapabilities, type ChannelDefinition } from "@/lib/channelCapabilities";
import { buildProviderSetup } from "@/lib/providerSetup";
import type { ConnectionHealth } from "@/lib/connectionUi";

/** Customer wording only. This model never grants execution permission. */
export function connectionPresentation(channel: ChannelDefinition, health?: ConnectionHealth) {
  const setup = health?.setup || buildProviderSetup(channel.id, health?.state || "not_connected", null);
  const assessment = assessConnectionCapabilities(channel.id, health?.state || "not_connected", health?.expiresAt);
  const connected = health?.state === "connected";
  const setupState = String(setup.state);
  const limitations: Record<string, string> = {
    facebook: "Publishing access still needs checking. Reading and replying to comments needs additional Facebook permission that Root must arrange.",
    instagram: "Publishing access still needs checking. Reading and replying to comments needs additional Instagram permission that Root must arrange.",
    linkedin: "Publishing access still needs checking. Reading responses is not available in Ops. Messages and invitations remain manual.",
    threads: "Publishing access still needs checking. Reading and replying to comments is not supported in Ops yet.",
    tiktok: "Direct Post access still needs checking against TikTok’s latest account settings. Older connections may need reconnecting. TikTok can limit who sees your posts until the app is approved. Draft upload remains an explicit fallback.",
    google: "Only your Google account is linked. Ops cannot publish posts or read and reply to reviews yet.",
    email: "Email setup is recorded, but sending and receiving still need checking by Root. Every reply sent from Ops needs your approval.",
  };
  const rootStates = ["credentials_required", "developer_registration_required", "business_verification_required", "provider_approval_required", "paid_account_required"];
  const rootBlocked = rootStates.includes(setup.state) || setup.configuration !== "present_not_verified";
  const canAuthorize = !!channel.connectPath && setup.canConnect && !rootBlocked && !["google", "email"].includes(channel.id);
  const action = !health ? "check" : canAuthorize && assessment.reconnectRequired ? "reconnect" : canAuthorize && !connected ? "connect" : "none";
  const owner = !health ? "checking" : action !== "none" ? "customer" : channel.statusMode === "available_soon" ? "none" : "root";
  const status = !health ? "Needs checking" : channel.statusMode === "available_soon" ? "Not supported yet"
    : setupState === "provider_approval_required" ? "Waiting for provider approval"
    : assessment.reconnectRequired ? "Needs checking" : !connected ? "Setup incomplete"
    : channel.id === "google" ? "Available manually" : channel.id === "email" ? "Needs checking" : "Connected";
  const next = owner === "checking" ? "Check connection to load the latest information."
    : owner === "customer" ? assessment.reconnectRequired ? "Reconnect your account to restore access. This will not unlock features Root still needs to enable." : "Connect the account you want Ops to use."
    : owner === "none" ? "There is nothing you need to do right now. This connection is not supported yet."
    : setupState === "provider_approval_required" ? "Root needs provider approval. There is nothing you need to do right now. Approval timing is controlled by the provider."
    : rootBlocked ? "Root needs to finish or check setup. There is nothing you need to do right now."
    : "Root needs to check the available features and arrange any missing access. There is nothing you need to do right now.";
  const steps = channel.id === "instagram" ? ["Sign in to Facebook with the account that manages your business Page.", `Select the Page linked to ${health?.name || "your professional Instagram account"}.`]
    : channel.id === "facebook" ? ["Sign in to Facebook with the account that manages your business Page.", `Select ${health?.name || "the business Page you want Ops to use"} when asked.`]
    : [`Sign in to the ${channel.name} account you want Ops to use.`, `Check that ${health?.name || "the intended account"} is selected.`];
  return { setup, assessment, status, owner, action,
    identity: !health ? "Connection not checked yet" : connected ? channel.id === "email" ? "Email setup saved" : `Connected${health.name ? ` to ${health.name}` : " account"}` : assessment.reconnectRequired ? "Your saved connection needs attention" : "Not connected",
    summary: !health ? "What Ops can do is not known yet." : connected ? limitations[channel.id] || "This channel is not supported in Ops yet." : "Ops cannot use this connection yet.",
    next, steps: [...steps, "Approve the access requested on the authorisation screen. Do not change developer or app-review settings.", "You should return to Ops automatically. If not, return here and check the connection. Connecting does not guarantee provider approval for every feature."],
    label: action === "connect" ? "Connect" : action === "reconnect" ? "Reconnect" : action === "check" ? "Check connection" : "Nothing to do",
    fallback: channel.id === "tiktok" ? "Direct Post processing needs a status refresh, not another upload. Only when you explicitly choose draft upload must you finish the existing draft in TikTok inbox. Do not upload it again."
      : channel.id === "email" ? "Before sending manually in Gmail, check whether the message already went out. Never repeat an uncertain send."
      : channel.id === "google" ? "Use Google Business Profile directly for posts and reviews."
      : "Where a prepared reply or draft is available in Ops, open its source, copy the text and finish manually. No message is sent from this page.",
  };
}
