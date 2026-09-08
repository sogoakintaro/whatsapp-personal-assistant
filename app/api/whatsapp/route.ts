import { NextRequest, NextResponse, after } from 'next/server'
import { verifySignature, isAllowedSender, sendText, fetchMedia } from '@/lib/inbox/whatsapp'
import { runAgent, type InboxImage } from '@/lib/inbox/agent'
import { MissingPageError } from '@/lib/inbox/pages'

// Node runtime is required for the `crypto` HMAC check and `after()`.
export const runtime = 'nodejs'

// Map WhatsApp's reported mime type to one the Anthropic vision API accepts,
// defaulting to JPEG (what WhatsApp sends for photos and most screenshots).
function toImageMediaType(mime: string): InboxImage['mediaType'] {
  const m = mime.toLowerCase()
  if (m.includes('png')) return 'image/png'
  if (m.includes('webp')) return 'image/webp'
  if (m.includes('gif')) return 'image/gif'
  return 'image/jpeg'
}

// Webhook verification handshake (Meta calls this once when saving the URL).
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new Response('Forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/plain' },
  })
}
export async function POST(request: NextRequest) {
  const raw = await request.text()

  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'))) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true })
  }

  const value = payload?.entry?.[0]?.changes?.[0]?.value
  const message = value?.messages?.[0]

  // Ignore delivery/read status callbacks and message types we don't handle.
  if (!message || !['text', 'image'].includes(message.type)) {
    return NextResponse.json({ ok: true })
  }

  const from: string = message.from
  if (!isAllowedSender(from)) {
    return NextResponse.json({ ok: true })
  }

  const textBody: string = (message.text?.body ?? '').trim()
  // Images carry a media id, not text — we fetch it in `after()`.
  const imageId: string | undefined = message.type === 'image' ? message.image?.id : undefined
  // A photo can ship with a caption; treat it as the text.
  const caption: string = message.type === 'image' ? (message.image?.caption ?? '').trim() : ''

  if (!textBody && !imageId) {
    return NextResponse.json({ ok: true })
  }

  // Acknowledge immediately; do the work after responding so Meta won't retry.
  after(async () => {
    try {
      let text = textBody
      let image: InboxImage | undefined
      if (imageId) {
        try {
          const { bytes, mimeType } = await fetchMedia(imageId)
          image = { data: bytes.toString('base64'), mediaType: toImageMediaType(mimeType) }
        } catch (err) {
          console.error('image fetch failed:', err)
          await sendText(from, "⚠️ Couldn't open that image — mind resending it?")
          return
        }
        text = caption // may be empty; the agent reads the image regardless
      }

      const { reply } = await runAgent(text, image)
      await sendText(from, reply)
    } catch (err) {
      console.error('WhatsApp inbox error:', err)
      try {
        // Configuration problems get a reply that says what to fix, rather than
        // a generic shrug the user can do nothing with.
        if (err instanceof MissingPageError) {
          await sendText(from, `⚠️ I can't find your "${err.title}" page in Notion. Open /setup and run "Create my Notion pages".`)
        } else if (err instanceof Error && /Missing required environment variable/.test(err.message)) {
          await sendText(from, `⚠️ ${err.message}`)
        } else {
          await sendText(from, "⚠️ Couldn't handle that — something went wrong. Try again in a moment.")
        }
      } catch {}
    }
  })

  return NextResponse.json({ ok: true })
}
