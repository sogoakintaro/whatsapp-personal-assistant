export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '4rem 1.5rem', lineHeight: 1.6 }}>
      <h1>WhatsApp Personal Assistant</h1>
      <p>
        Text yourself a note on WhatsApp and it files itself into Notion as a to-do,
        a learning, or a musing.
      </p>
      <p>
        This deployment is set up at <code>/setup</code> (you need the setup key).
        Source and instructions:{' '}
        <a href="https://github.com/sakkyb/whatsapp-personal-assistant">GitHub</a>.
      </p>
    </main>
  )
}
