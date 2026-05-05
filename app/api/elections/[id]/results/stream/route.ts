import { getSession } from "@/lib/auth"
import { getResultsForElection } from "@/lib/results"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { id } = await params
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const data = await getResultsForElection(id)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // ignore transient DB errors
        }
      }

      await send()
      const interval = setInterval(send, 5000)

      req.signal.addEventListener("abort", () => {
        clearInterval(interval)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
