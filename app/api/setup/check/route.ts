import { NextRequest, NextResponse } from 'next/server'
import { setupSecretOk } from '@/lib/setup/gate'
import { checkAnthropic, checkNotion, checkWhatsApp } from '@/lib/setup/checks'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  // The gate lives here, not only on the page — this route is publicly routable.
  if (!setupSecretOk(request.nextUrl.searchParams.get('key'))) {
    return new NextResponse('Not found', { status: 404 })
  }

  const [anthropic, notion, whatsapp] = await Promise.all([
    checkAnthropic(),
    checkNotion(),
    checkWhatsApp(),
  ])

  return NextResponse.json({ anthropic, notion, whatsapp })
}
