// app/dashboard/brainstorm/page.tsx
"use client";

import React from "react";

export default function BrainstormPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">🧠 Brainstorm Studio</h1>
      <p className="text-sm text-gray-500">
        This is the future home of your conversational content studio.
        Once this is stable, we’ll wire it up so you can chat with AI,
        then send the final posts straight into your existing{" "}
        <strong>series / stories</strong> system.
      </p>

      <div className="border rounded-lg p-4 bg-white/80 shadow-sm">
        <p className="text-sm text-gray-600">
          For now, this is just a placeholder page to make sure the build works.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          If you can see this page at <code>/dashboard/brainstorm</code>,
          it means Vercel is deploying correctly again.
        </p>
      </div>
    </div>
  );
}
