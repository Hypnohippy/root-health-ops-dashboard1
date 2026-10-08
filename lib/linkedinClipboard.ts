/** Provider navigation and clipboard only. This function has no completion API. */
export async function openAndCopyLinkedIn(message: string, destination: string | null, browser: {
  open: (url: string) => boolean | void; copy: (text: string) => Promise<void>;
}) {
  let blocked = false;
  if (destination) {
    try { blocked = browser.open(destination) === false; } catch { blocked = true; }
  }
  // Opening must stay synchronous with the click, but must never prevent copying.
  await browser.copy(message);
  if (blocked) return "Copied. LinkedIn could not open: use the recorded destination link below, then paste your message.";
  return destination ? "Copied. Paste and send in the LinkedIn tab, then confirm below." : "Copied. No LinkedIn destination is recorded; find the conversation manually.";
}
