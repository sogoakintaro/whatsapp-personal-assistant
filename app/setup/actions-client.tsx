'use client'

import { useState } from 'react'

type CheckResult = { ok: boolean; detail: string }
type Checks = { anthropic: CheckResult; notion: CheckResult; whatsapp: CheckResult }

const box: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: '1rem',
  margin: '1rem 0',
  background: '#fff',
}

const button: React.CSSProperties = {
  padding: '0.6rem 1rem',
  borderRadius: 6,
  border: '1px solid #111',
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '0.95rem',
}

function Row({ label, result }: { label: string; result: CheckResult | undefined }) {
  if (!result) return null
  return (
    <p style={{ margin: '0.5rem 0' }}>
      <strong>
        {result.ok ? '✅' : '❌'} {label}
      </strong>
      <br />
      <span style={{ color: '#555' }}>{result.detail}</span>
    </p>
  )
}

export function SetupActions({ setupKey }: { setupKey: string }) {
  const [checks, setChecks] = useState<Checks | null>(null)
  const [checking, setChecking] = useState(false)
  const [boot, setBoot] = useState<string | null>(null)
  const [booting, setBooting] = useState(false)

  const qs = `?key=${encodeURIComponent(setupKey)}`

  async function runChecks() {
    setChecking(true)
    setChecks(null)
    try {
      const res = await fetch(`/api/setup/check${qs}`, { method: 'POST' })
      setChecks(await res.json())
    } catch (err) {
      setBoot(`Could not run checks: ${(err as Error).message}`)
    } finally {
      setChecking(false)
    }
  }

  async function runBootstrap() {
    setBooting(true)
    setBoot(null)
    try {
      const res = await fetch(`/api/setup/bootstrap${qs}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setBoot(`❌ ${data.error}`)
      } else {
        const made = data.created.length ? `Created: ${data.created.join(', ')}. ` : ''
        const had = data.existing.length ? `Already there: ${data.existing.join(', ')}. ` : ''
        setBoot(`✅ ${made}${had}To-do lists: ${data.sections.join(', ')}. Month toggle: ${data.month}.`)
      }
    } catch (err) {
      setBoot(`❌ ${(err as Error).message}`)
    } finally {
      setBooting(false)
    }
  }

  return (
    <>
      <div style={box}>
        <h2 style={{ marginTop: 0 }}>2. Check they actually work</h2>
        <p style={{ color: '#555' }}>
          Filled in is not the same as working — a typo looks identical to a correct value. This
          calls Anthropic, Notion and Meta for real and tells you what each one said. Run it again
          after every change.
        </p>
        <button style={button} onClick={runChecks} disabled={checking}>
          {checking ? 'Checking…' : 'Test my credentials'}
        </button>
        {checks && (
          <div style={{ marginTop: '1rem' }}>
            <Row label="Anthropic" result={checks.anthropic} />
            <Row label="Notion" result={checks.notion} />
            <Row label="WhatsApp" result={checks.whatsapp} />
          </div>
        )}
      </div>

      <div style={box}>
        <h2 style={{ marginTop: 0 }}>3. Build the Notion pages</h2>
        <p style={{ color: '#555' }}>
          Do this once the Notion check above is green. It creates <strong>Todo</strong>,{' '}
          <strong>Learnings</strong> and <strong>Musings</strong> inside the page you shared, adds
          your to-do lists as headings, and opens this month&apos;s toggle. Later months are created
          automatically as they arrive.
        </p>
        <p style={{ color: '#555', fontSize: '0.9rem' }}>
          Safe to press twice — it looks before it creates, so nothing gets duplicated.
        </p>
        <button style={button} onClick={runBootstrap} disabled={booting}>
          {booting ? 'Creating…' : 'Create my Notion pages'}
        </button>
        {boot && <p style={{ marginTop: '1rem' }}>{boot}</p>}
      </div>
    </>
  )
}
