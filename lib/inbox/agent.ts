// The "brain": a small tool-use agent that files notes into Notion. It loops
// (call tool → read result → act) until it produces a reply.

import Anthropic from '@anthropic-ai/sdk'
import { TODO_SECTIONS, TODO_SECTION_HINTS, USER_TIMEZONE } from './config'
import {
  findSections,
  findByLabel,
  appendToDo,
  appendBullet,
  notionDeepLink,
  ensureSection,
  type Section,
} from './notion'
import { resolvePages, type PageIds } from './pages'
import { currentMonthLabel, currentYear } from './dates'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = process.env.INBOX_MODEL || 'claude-haiku-4-5'

export type AgentResult = { reply: string }

// A WhatsApp image handed to the agent for vision. media_type is constrained to
// what the Anthropic API accepts.
export type InboxImage = {
  data: string // base64, no data: prefix
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

type Ctx = { todoCandidates: Section[]; pages: PageIds }

type ToolOut = { text: string }

async function runTool(name: string, input: Record<string, unknown>, ctx: Ctx): Promise<ToolOut> {
  try {
    switch (name) {
      case 'add_todo': {
        const text = String(input.text || '').trim()
        if (!text) return { text: 'No text provided.' }
        const due = input.due ? String(input.due).trim() : undefined
        const target = findByLabel(ctx.todoCandidates, input.list as string) || ctx.todoCandidates[0]
        const b = await appendToDo(target?.id || ctx.pages.todo, text, due)
        const dated = due ? ` with a ${due} date chip` : ''
        return {
          text: `Added to-do${target ? ` to "${target.label}"` : ''}${dated}. Link: ${notionDeepLink(ctx.pages.todo, b?.id)}`,
        }
      }
      case 'add_learning':
      case 'add_musing': {
        const text = String(input.text || '').trim()
        if (!text) return { text: 'No text provided.' }
        const isLearning = name === 'add_learning'
        const pageId = isLearning ? ctx.pages.learning : ctx.pages.musing
        const noun = isLearning ? 'Learnings' : 'Musings'
        const month = currentMonthLabel(USER_TIMEZONE)
        // Create the month's toggle if this is the first note of the month.
        const sectionId = await ensureSection(pageId, month, 'toggle')
        const b = await appendBullet(sectionId, text)
        return {
          text: `Added under ${month} in ${noun}. Link: ${notionDeepLink(pageId, b?.id)}`,
        }
      }
      default:
        return { text: `Unknown tool ${name}` }
    }
  } catch (err) {
    console.error('inbox tool error', name, err)
    return { text: `Error running ${name}: ${(err as Error).message}` }
  }
}

export async function runAgent(message: string, image?: InboxImage): Promise<AgentResult> {
  const pages = await resolvePages()

  // Discover the live to-do sections, filtered to the configured allow-list.
  const discovered = await findSections(pages.todo)
  const todoCandidates = discovered.filter((s) =>
    TODO_SECTIONS.some((n) => n.toLowerCase() === s.label.toLowerCase()),
  )
  const todoLabels = todoCandidates.map((c) => c.label)
  const listHint = todoLabels
    .map((s) => {
      const h = TODO_SECTION_HINTS[s.toLowerCase()]
      return h ? `"${s}" (${h})` : `"${s}"`
    })
    .join(', ')

  const year = currentYear(USER_TIMEZONE)

  const tools: Anthropic.Tool[] = [
    {
      name: 'add_todo',
      description: 'Add a to-do / task to Notion.',
      input_schema: {
        type: 'object',
        properties: {
          list: todoLabels.length
            ? { type: 'string', enum: todoLabels, description: `Which list. Options: ${listHint}.` }
            : { type: 'string', description: 'Which list.' },
          text: { type: 'string', description: 'The task, lightly cleaned. Keep meaning and voice.' },
          due: {
            type: 'string',
            description:
              'Optional date to attach as an inline Notion date chip (like typing "@today"). Naive local format: YYYY-MM-DD for all-day, or YYYY-MM-DDTHH:MM:SS if the user gave a specific time. Resolve relative dates ("today", "tomorrow", "by Friday", "next week") against the current local time. Omit entirely when the task has no date.',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'add_learning',
      description: `Save an insight/lesson under the current month in the ${year} Learnings page.`,
      input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    {
      name: 'add_musing',
      description: `Save a reflection/idea under the current month in the ${year} Musings page.`,
      input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
  ]

  const human = new Intl.DateTimeFormat('en-GB', {
    timeZone: USER_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  const system =
    'You are a personal assistant the user texts over WhatsApp. You file their quick notes into Notion.\n' +
    `Now: ${human} (${USER_TIMEZONE}).\n` +
    'Pick exactly one of: add_todo (something to do), add_learning (something they learned), add_musing (a reflection or idea). Lightly clean the text — fix dictation and punctuation only — but keep the meaning and their voice.\n' +
    'If a to-do names or implies a date ("today", "tomorrow", "by Friday", "next week", "on the 3rd"), pass it as add_todo\'s `due` so it shows as an inline date chip — a naive-local YYYY-MM-DD, or YYYY-MM-DDTHH:MM:SS only if they gave a specific time. Leave `due` off when there is no date. The chip displays the date; it does not by itself send a reminder.\n' +
    'If an image is attached (a screenshot, a whiteboard, a poster, a receipt), read it and file what it shows: an actionable task becomes a to-do, anything else becomes a learning or a musing. Echo back the key details you pulled out so a misread is easy to spot. If the image is blurry or you are unsure, say what you can see and ask before filing.\n' +
    'If a request is genuinely ambiguous, ask one short clarifying question instead of guessing.\n' +
    'Reply in one or two short, friendly lines, and always include the link the tool returns.'

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: image
        ? [
            { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
            { type: 'text', text: message || 'Read this image and file it appropriately.' },
          ]
        : message,
    },
  ]
  const ctx: Ctx = { todoCandidates, pages }

  for (let step = 0; step < 5; step++) {
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens: 1024, system, tools, messages })
    messages.push({ role: 'assistant', content: resp.content })

    const toolUses = resp.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
    if (toolUses.length === 0) {
      const text = resp.content
        .filter((c): c is Anthropic.TextBlock => c.type === 'text')
        .map((c) => c.text)
        .join('\n')
        .trim()
      return { reply: text || '✅ Done.' }
    }

    const results: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const r = await runTool(tu.name, (tu.input || {}) as Record<string, unknown>, ctx)
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: r.text })
    }
    messages.push({ role: 'user', content: results })
  }

  return { reply: '⚠️ That got complicated — could you rephrase?' }
}
