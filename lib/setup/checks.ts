// Live credential validation for the setup wizard. Each check calls the real
// service, because "the variable is set" and "the credential works" are
// different questions and only the second one matters.
//
// No check ever returns a credential value — only whether it worked and what to
// do about it.

import Anthropic from '@anthropic-ai/sdk'
import { GRAPH_VERSION } from '@/lib/inbox/config'
import { notionUserName } from '@/lib/inbox/notion'

export type CheckResult = { ok: boolean; detail: string }
export type EnvRow = { name: string; set: boolean; required: boolean }

const REQUIRED = [
  'ANTHROPIC_API_KEY',
  'NOTION_TOKEN',
  'NOTION_PARENT_PAGE_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ALLOWED_SENDERS',
  'SETUP_SECRET',
]

const OPTIONAL = ['NOTION_TODO_SECTIONS', 'USER_TIMEZONE', 'INBOX_MODEL', 'WHATSAPP_GRAPH_VERSION']

export function envChecklist(): EnvRow[] {
  const isSet = (n: string) => Boolean(process.env[n] && process.env[n]!.trim())
  return [
    ...REQUIRED.map((name) => ({ name, set: isSet(name), required: true })),
    ...OPTIONAL.map((name) => ({ name, set: isSet(name), required: false })),
  ]
}

export async function checkAnthropic(): Promise<CheckResult> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, detail: 'ANTHROPIC_API_KEY is not set.' }

  const model = process.env.INBOX_MODEL || 'claude-haiku-4-5'
  try {
    const client = new Anthropic({ apiKey: key })
    await client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
    return { ok: true, detail: `API key works, and "${model}" is a valid model.` }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, detail: 'Anthropic rejected the key. Check ANTHROPIC_API_KEY.' }
    }
    if (err instanceof Anthropic.BadRequestError && /model/i.test(err.message)) {
      return {
        ok: false,
        detail: `The key works, but "${model}" is not a valid model id. Unset INBOX_MODEL to use the default.`,
      }
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, detail: 'The key works but is rate limited right now. Try again in a moment.' }
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, detail: `Anthropic returned ${err.status}: ${err.message}` }
    }
    return { ok: false, detail: `Could not reach Anthropic: ${(err as Error).message}` }
  }
}

export async function checkNotion(): Promise<CheckResult> {
  if (!process.env.NOTION_TOKEN) return { ok: false, detail: 'NOTION_TOKEN is not set.' }
  const parent = process.env.NOTION_PARENT_PAGE_ID
  if (!parent) return { ok: false, detail: 'NOTION_PARENT_PAGE_ID is not set.' }

  let name: string
  try {
    name = await notionUserName()
  } catch (err) {
    return { ok: false, detail: `Notion rejected the token: ${(err as Error).message}` }
  }

  // The token being valid says nothing about the integration being able to see
  // the parent page — forgetting to share it is the most common Notion mistake.
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${parent}`, {
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
      },
    })
    if (res.status === 404) {
      return {
        ok: false,
        detail:
          `Connected as "${name}", but it cannot see that page. In Notion open your parent page → ••• → Connections → add this integration. ` +
          'Also check NOTION_PARENT_PAGE_ID is the 32-character id from the page URL.',
      }
    }
    if (!res.ok) return { ok: false, detail: `Notion returned ${res.status} for the parent page.` }
    return { ok: true, detail: `Connected as "${name}" and your parent page is shared with it.` }
  } catch (err) {
    return { ok: false, detail: `Could not reach Notion: ${(err as Error).message}` }
  }
}

export async function checkWhatsApp(): Promise<CheckResult> {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token) return { ok: false, detail: 'WHATSAPP_TOKEN is not set.' }
  if (!phoneId) return { ok: false, detail: 'WHATSAPP_PHONE_NUMBER_ID is not set.' }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await res.text()

    if (res.ok) {
      let display = ''
      try {
        display = (JSON.parse(body).display_phone_number as string) || ''
      } catch {}
      return { ok: true, detail: `Token works${display ? ` for ${display}` : ''}.` }
    }

    // Meta uses OAuth error code 190 for invalid *and* expired tokens. The
    // expired case is the one that matters: the temporary token on the API Setup
    // page lasts 24 hours, so this is the single most likely reason a working
    // assistant goes silent the next day.
    let code: number | undefined
    let message = ''
    try {
      const err = JSON.parse(body).error || {}
      code = err.code
      message = String(err.message || '')
    } catch {}

    if (code === 190 || /expired/i.test(message)) {
      return {
        ok: false,
        detail:
          'Your WhatsApp token has expired or been revoked. The temporary token on the API Setup page only lasts 24 hours — ' +
          'create a System User in Business Settings, give it whatsapp_business_messaging, generate a non-expiring token, and put that in WHATSAPP_TOKEN.',
      }
    }
    if (res.status === 404) {
      return { ok: false, detail: 'That phone number id does not exist. Copy it from WhatsApp → API Setup.' }
    }
    return { ok: false, detail: `WhatsApp returned ${res.status}${message ? `: ${message}` : ''}.` }
  } catch (err) {
    return { ok: false, detail: `Could not reach Meta: ${(err as Error).message}` }
  }
}
