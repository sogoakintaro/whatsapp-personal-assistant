import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { verifySignature, isAllowedSender } from './whatsapp'

const SECRET = 'test-app-secret'
const BODY = '{"entry":[{"changes":[]}]}'

function sign(body: string, secret = SECRET): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

describe('verifySignature', () => {
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = SECRET
  })
  afterEach(() => {
    delete process.env.WHATSAPP_APP_SECRET
  })

  it('accepts a correctly signed body', () => {
    expect(verifySignature(BODY, sign(BODY))).toBe(true)
  })

  it('rejects a tampered body', () => {
    expect(verifySignature(BODY + ' ', sign(BODY))).toBe(false)
  })

  it('rejects a signature made with the wrong secret', () => {
    expect(verifySignature(BODY, sign(BODY, 'wrong-secret'))).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(verifySignature(BODY, null)).toBe(false)
  })

  it('rejects a header without the sha256= prefix', () => {
    expect(verifySignature(BODY, sign(BODY).replace('sha256=', ''))).toBe(false)
  })

  it('rejects a truncated signature without throwing on length mismatch', () => {
    expect(verifySignature(BODY, sign(BODY).slice(0, 20))).toBe(false)
  })

  it('fails closed when the app secret is unset', () => {
    delete process.env.WHATSAPP_APP_SECRET
    expect(verifySignature(BODY, sign(BODY))).toBe(false)
  })
})

describe('isAllowedSender', () => {
  afterEach(() => {
    delete process.env.WHATSAPP_ALLOWED_SENDERS
  })

  it('fails closed when the allow-list is unset', () => {
    expect(isAllowedSender('447700900123')).toBe(false)
  })

  it('fails closed when the allow-list is empty', () => {
    process.env.WHATSAPP_ALLOWED_SENDERS = '  , ,'
    expect(isAllowedSender('447700900123')).toBe(false)
  })

  it('allows a listed sender', () => {
    process.env.WHATSAPP_ALLOWED_SENDERS = '447700900123'
    expect(isAllowedSender('447700900123')).toBe(true)
  })

  it('rejects an unlisted sender', () => {
    process.env.WHATSAPP_ALLOWED_SENDERS = '447700900123'
    expect(isAllowedSender('447700900999')).toBe(false)
  })

  it('ignores formatting in both the list and the sender', () => {
    process.env.WHATSAPP_ALLOWED_SENDERS = '+44 7700 900123, +1 (555) 010-9999'
    expect(isAllowedSender('447700900123')).toBe(true)
    expect(isAllowedSender('15550109999')).toBe(true)
  })
})
