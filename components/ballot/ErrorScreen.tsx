const MESSAGES: Record<string, { title: string; body: string }> = {
  invalid: {
    title: "Invalid voting link",
    body: "This link is not valid. Please check your email for the correct link.",
  },
  "already-voted": {
    title: "Already voted",
    body: "You have already submitted your vote for this election. Thank you for participating!",
  },
  closed: {
    title: "Election closed",
    body: "This election is no longer accepting votes.",
  },
  "not-open": {
    title: "Election not open",
    body: "This election has not started yet. Please check back later.",
  },
}

export default function ErrorScreen({ type }: { type: string }) {
  const msg = MESSAGES[type] ?? MESSAGES.invalid
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="max-w-md text-center p-8">
        <h1 className="text-xl font-bold mb-2">{msg.title}</h1>
        <p className="text-zinc-500">{msg.body}</p>
      </div>
    </div>
  )
}
