import { NextRequest, NextResponse } from 'next/server'
import { setupSecretOk } from '@/lib/setup/gate'
import { PAGE_TITLES, TODO_SECTIONS, USER_TIMEZONE, parentPageId } from '@/lib/inbox/config'
import { findChildPageByTitle, createPage, ensureSection } from '@/lib/inbox/notion'
import { clearPageCache } from '@/lib/inbox/pages'
import { currentMonthLabel } from '@/lib/inbox/dates'

export const runtime = 'nodejs'

const ICONS: Record<string, string> = { Todo: '☑️', Learnings: '🧠', Musings: '🍄' }

export async function POST(request: NextRequest) {
  if (!setupSecretOk(request.nextUrl.searchParams.get('key'))) {
    return new NextResponse('Not found', { status: 404 })
  }

  try {
    const parent = parentPageId()
    const created: string[] = []
    const existing: string[] = []

    // Idempotent: look before creating, so a double click cannot duplicate.
    const ids: Record<string, string> = {}
    for (const title of Object.values(PAGE_TITLES)) {
      const found = await findChildPageByTitle(parent, title)
      if (found) {
        ids[title] = found
        existing.push(title)
      } else {
        ids[title] = await createPage(parent, title, ICONS[title])
        created.push(title)
      }
    }

    // Todo gets a heading per configured sub-list.
    for (const section of TODO_SECTIONS) {
      await ensureSection(ids[PAGE_TITLES.todo], section, 'heading_3')
    }

    // Learnings and Musings get this month's toggle. Later months are created on
    // demand by the agent, so there is nothing to pre-build.
    const month = currentMonthLabel(USER_TIMEZONE)
    await ensureSection(ids[PAGE_TITLES.learning], month, 'toggle')
    await ensureSection(ids[PAGE_TITLES.musing], month, 'toggle')

    // The runtime cache may hold a failed lookup from before the pages existed.
    clearPageCache()

    return NextResponse.json({ created, existing, sections: TODO_SECTIONS, month })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
