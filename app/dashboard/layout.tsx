"use client";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const linkClasses = (href: string) =>
    `px-3 py-2 text-sm rounded-full transition ${
      pathname === href
        ? "bg-white/20 text-white"
        : "hover:bg-white/10 text-slate-200"
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 text-slate-50">
      {/* Header */}
      <header className="flex items-center justify-between p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Root Health Ops</h1>
          <p className="text-slate-300 text-xs">Your cockpit for growth</p>
        </div>

        {/* Navigation */}
        <nav className="backdrop-blur-md bg-white/5 border border-white/10 rounded-full px-2 py-1 shadow-md">
          <ul className="flex items-center gap-1">
            <li>
              <a href="/dashboard" className={linkClasses("/dashboard")}>
                Home
              </a>
            </li>
            <li>
              <a
                href="/dashboard/connect"
                className={linkClasses("/dashboard/connect")}
              >
                Connect
              </a>
            </li>
            <li>
              <a
                href="/dashboard/metrics"
                className={linkClasses("/dashboard/metrics")}
              >
                Metrics
              </a>
            </li>
           <li>
  <a
    href="/dashboard/campaigns"
    className={linkClasses("/dashboard/campaigns")}
  >
    Campaigns
  </a>
</li>
  <a
    href="/dashboard/stories/new"
    className={linkClasses("/dashboard/stories/new")}
  >
    Stories
  </a>
</li>


          </ul>
        </nav>
      </header>

      {/* Page Content */}
      <main className="p-6">{children}</main>
    </div>
  );
}
