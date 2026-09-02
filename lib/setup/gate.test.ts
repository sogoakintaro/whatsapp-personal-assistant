import { describe, it, expect, afterEach } from 'vitest'
import { setupSecretOk } from './gate'

describe('setupSecretOk', () => {
  afterEach(() => {
    delete process.env.SETUP_SECRET
  })

  it('accepts the correct secret', () => {
    process.env.SETUP_SECRET = 's3cret-value'
    expect(setupSecretOk('s3cret-value')).toBe(true)
  })

  it('rejects a wrong secret of the same length', () => {
    process.env.SETUP_SECRET = 's3cret-value'
    expect(setupSecretOk('s3cret-valuX')).toBe(false)
  })

  it('rejects a wrong secret of a different length without throwing', () => {
    process.env.SETUP_SECRET = 's3cret-value'
    expect(setupSecretOk('short')).toBe(false)
  })

  it('rejects a null key', () => {
    process.env.SETUP_SECRET = 's3cret-value'
    expect(setupSecretOk(null)).toBe(false)
  })

  // Unsetting SETUP_SECRET is the documented way to switch the wizard off for
  // good once setup is done, so it must deny everything — including an empty key.
  it('denies everything when SETUP_SECRET is unset', () => {
    expect(setupSecretOk('anything')).toBe(false)
    expect(setupSecretOk('')).toBe(false)
    expect(setupSecretOk(null)).toBe(false)
  })
})
