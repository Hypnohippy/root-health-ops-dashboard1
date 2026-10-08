/** Provider navigation and clipboard only. This function has no completion API. */
export async function openAndCopyLinkedIn(message: string, destination: string | null, browser: {
  open: (url: string) => void; copy: (text: string) => Promise<void>;
}) {
  if (destination) browser.open(destination);
  await browser.copy(message);
  return destination ? "Copied. Paste and send in the LinkedIn tab, then confirm below. If no tab opened, use the destination link." : "Copied. No LinkedIn destination is recorded; find the conversation manually.";
}
