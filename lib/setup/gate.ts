// The setup wizard sits on a public URL, so both the page and the API routes it
// calls are gated on a shared secret. Gating only the page would leave
// POST /api/setup/bootstrap open to anyone, able to create pages in the
// deployer's Notion workspace.
//
// Unsetting SETUP_SECRET denies everything, which is the documented way to
// retire the wizard once setup is finished.

import crypto from 'crypto'

export function setupSecretOk(provided: string | null): boolean {
  const secret = process.env.SETUP_SECRET
  if (!secret || !provided) return false

  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
