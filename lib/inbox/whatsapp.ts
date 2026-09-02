// WhatsApp Cloud API helpers: webhook signature verification, sender allow-list,
// and sending a text reply via the Graph API.

import crypto from 'crypto'
import { GRAPH_VERSION } from './config'

// Verifies Meta's X-Hub-Signature-256 header against the raw request body using
// the app secret. Returns false (fail-closed) if anything is missing.
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret || !header || !header.startsWith('sha256=')) return false

  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Only senders listed in WHATSAPP_ALLOWED_SENDERS (comma-separated, any format)
// may write to Notion. Fail-closed: an empty list blocks everyone.
export function isAllowedSender(from: string): boolean {
  const allow = (process.env.WHATSAPP_ALLOWED_SENDERS || '')
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean)
  if (allow.length === 0) return false
  return allow.includes(from.replace(/\D/g, ''))
}

// Downloads an inbound media object (e.g. a photo) by its media id. The
// Graph API hands back a short-lived, authenticated CDN URL first; the same
// bearer token is then required to pull the actual bytes.
export async function fetchMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) throw new Error('Missing WHATSAPP_TOKEN')

  const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!metaRes.ok) {
    throw new Error(`WhatsApp media lookup ${mediaId} → ${metaRes.status}: ${await metaRes.text()}`)
  }
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string }
  if (!meta.url) throw new Error('WhatsApp media response had no download url')

  const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!binRes.ok) {
    throw new Error(`WhatsApp media download → ${binRes.status}: ${await binRes.text()}`)
  }
  const bytes = Buffer.from(await binRes.arrayBuffer())
  return { bytes, mimeType: meta.mime_type || 'application/octet-stream' }
}

// Sends a plain-text WhatsApp message back to the sender. Link previews are on
// so the Notion link renders nicely.
export async function sendText(to: string, body: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token = process.env.WHATSAPP_TOKEN
  if (!phoneId || !token) throw new Error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN')

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: true },
    }),
  })

  if (!res.ok) {
    const t = await res.text()
    console.error('WhatsApp send failed', res.status, t)
  }
}
