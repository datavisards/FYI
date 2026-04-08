type EmitFn = (data: Record<string, unknown>) => void

/**
 * Creates a Server-Sent Events (SSE) streaming Response.
 *
 * Automatically appends `data: [DONE]\n\n` and closes the stream when the
 * handler resolves or returns early. Unhandled errors are caught, emitted as
 * `{ error: message }`, and the stream is closed cleanly.
 *
 * @param handler  Async function that receives an `emit` helper. Call `emit`
 *                 to send an SSE event. Return early to close the stream before
 *                 all work is done (e.g. when deferring to the client).
 * @param extraHeaders  Additional response headers (e.g. CORS headers).
 */
export function createSSEStream(
  handler: (emit: EmitFn) => Promise<void>,
  extraHeaders?: Record<string, string>
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit: EmitFn = (data) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        await handler(emit)
      } catch (err) {
        emit({ error: (err as Error).message ?? 'Unknown error' })
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...extraHeaders,
    },
  })
}
