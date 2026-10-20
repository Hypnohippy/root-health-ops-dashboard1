      </footer>

      {supportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={closeSupport} />

          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-slate-400">Support</div>
                <div className="mt-1 text-lg font-semibold text-slate-100">
                  Contact Root Health Ops
                </div>
                <div className="mt-1 text-[12px] text-slate-400">
                  We’ll automatically attach the latest error details (JSON) so
                  you don’t have to.
                </div>
              </div>

              <button
                className="rounded-2xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 hover:border-slate-600"
                onClick={closeSupport}
              >
                Close
              </button>
            </div>

            {supportDone === "ok" ? (
              <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 text-emerald-100">
                Sent ✅ We’ve received your message (with diagnostic details attached).
              </div>
            ) : null}

            {supportDone === "fail" ? (
              <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/30 p-4 text-red-100">
                Failed to send. {supportError || "Please try again."}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">
                  Your email (optional)
                </label>
                <input
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="you@domain.com"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">
                  What happened?
                </label>
                <textarea
                  value={supportMsg}
                  onChange={(e) => setSupportMsg(e.target.value)}
                  rows={7}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  placeholder="Tell us what you tried and what you expected…"
                />
                <div className="mt-1 text-[11px] text-slate-500">
                  Tip: mention the platform and whether it was Campaign Studio,
                  Brainstorm, Publishing, or Resources.
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={sendSupport}
                  disabled={!canSend}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {supportSending ? "Sending…" : "Send to Support"}
                </button>

                <button
                  type="button"
                  onClick={closeSupport}
                  disabled={supportSending}
                  className="rounded-2xl border border-slate-600 bg-slate-950 px-5 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>

              <div className="text-[11px] text-slate-500">
                Press <b>Esc</b> to close.
              </div>

              {orgId ? (
                <div className="text-[11px] text-slate-600">
                  (Diagnostics will be attached for org{" "}
                  <span className="break-all">{orgId}</span>)
                </div>
              ) : (
                <div className="text-[11px] text-slate-600">
                  (Diagnostics will still send — org auto-detect will be attempted server-side.)
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
