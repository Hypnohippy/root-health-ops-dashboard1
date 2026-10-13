/** Presentation only: retain every source character, including quoted history. */
export function splitEmailFooter(body: string): { content: string; footer: string } {
  // Only explicit sign-offs/delimiters or legal notice paragraphs, never health/intent inference.
  const start = body.search(/^(?:-- ?|(?:kind|best) regards[, ]*|regards[, ]*|confidentiality notice:?.*|disclaimer:?.*|this (?:email|e-mail|message) (?:and any attachments )?is (?:confidential|intended(?: solely| only)? for|strictly confidential).*|the information contained in this (?:email|e-mail).*)\r?$/im);
  if (start <= 0 || !body.slice(0, start).trim()) return { content: body, footer: "" };
  return { content: body.slice(0, start), footer: body.slice(start) };
}

export default function EmailMessageBody({ body }: { body: string }) {
  const { content, footer } = splitEmailFooter(body);
  return <div className="min-w-0 break-words">
    <div className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{content}</div>
    {footer && <details className="mt-3 border-t border-white/10 pt-2 text-xs text-slate-400">
      <summary className="cursor-pointer">Signature / footer and additional email text</summary>
      <div className="mt-2 whitespace-pre-wrap leading-5">{footer}</div>
    </details>}
  </div>;
}
