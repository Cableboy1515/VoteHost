import Link from "next/link"

const STEPS = [
  {
    n: 1,
    title: "Build your ballot",
    desc: "Single choice, multiple choice, preference ranking, or write-in questions — mix as you like.",
  },
  {
    n: 2,
    title: "Add your voters",
    desc: "Manually enter names & emails or import a CSV. They don't need an account.",
  },
  {
    n: 3,
    title: "Send invitations",
    desc: "Voters get a one-time link by email. Encrypted and anonymous.",
  },
]

export function DashboardEmpty() {
  return (
    <div
      className="bg-vh-surface rounded-[18px] p-8"
      style={{ border: "1px solid var(--vh-line)" }}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
        {STEPS.map((s) => (
          <div
            key={s.n}
            className="rounded-[14px] p-5"
            style={{ background: "var(--vh-bg)", border: "1px solid var(--vh-line)" }}
          >
            <div
              className="w-8 h-8 rounded-[10px] flex items-center justify-center text-sm font-semibold mb-4"
              style={{
                background: "var(--vh-accent-soft)",
                color: "var(--vh-accent-strong)",
              }}
            >
              {s.n}
            </div>
            <div className="text-[15px] font-medium mb-1.5">{s.title}</div>
            <div className="text-[13.5px] leading-relaxed" style={{ color: "var(--vh-muted)" }}>
              {s.desc}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link
          href="/elections/new"
          className="inline-flex items-center justify-center px-5 py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors"
          style={{ background: "var(--vh-accent)" }}
        >
          Create your first election
        </Link>
      </div>
    </div>
  )
}
