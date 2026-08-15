export { OPTIONS } from '@/lib/cors'

export function GET() {
  return Response.json({ status: 'ok' })
}
