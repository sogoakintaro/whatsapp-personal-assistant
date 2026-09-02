// The setup copy lives here rather than inline in the page, so the wizard stays
// readable and the instructions have one home.
//
// The wizard is the single source of truth for setup. The README covers only
// what you cannot do from inside the app — deploying it in the first place —
// and then hands over to this. Don't duplicate these steps in the README: two
// copies of a procedure drift, and the stale one is always the one being read.

export type VarHelp = {
  what: string
  where: string
  link?: { href: string; label: string }
}

// Shown beside each required variable so "missing" is actionable rather than
// just a red cross.
export const VAR_HELP: Record<string, VarHelp> = {
  ANTHROPIC_API_KEY: {
    what: 'Lets the assistant think. This is the only part that costs money — fractions of a penny per message.',
    where: 'Create a key in the Anthropic Console, then paste it into Vercel.',
    link: { href: 'https://console.anthropic.com/settings/keys', label: 'console.anthropic.com' },
  },
  NOTION_TOKEN: {
    what: 'Lets the assistant write into your Notion.',
    where:
      'New integration → internal → give it "Read content" and "Insert content". Copy the Internal Integration Secret.',
    link: { href: 'https://www.notion.so/profile/integrations', label: 'notion.so/profile/integrations' },
  },
  NOTION_PARENT_PAGE_ID: {
    what: 'The one page everything gets built inside.',
    where:
      'Make a page in Notion (call it "Assistant"). Open it → ••• → Connections → add your integration. Then copy the 32-character id from the page URL: notion.so/Assistant-<THIS BIT>.',
  },
  WHATSAPP_VERIFY_TOKEN: {
    what: 'A password you invent, shared between this app and Meta so each knows the other is genuine.',
    where: 'Make one up now — any random string. You will type the same value into Meta in step 4.',
  },
  WHATSAPP_APP_SECRET: {
    what: 'Proves an incoming message really came from Meta and not someone pretending.',
    where: 'In your Meta app: App Settings → Basic → App Secret → Show.',
  },
  WHATSAPP_TOKEN: {
    what: 'Lets the assistant send replies back to you.',
    where:
      'Business Settings → Users → System Users → create one → Add Assets (your app) → Generate token with whatsapp_business_messaging and NO expiry. Not the temporary token on the API Setup page.',
  },
  WHATSAPP_PHONE_NUMBER_ID: {
    what: 'Which number the assistant sends from.',
    where: 'In your Meta app: WhatsApp → API Setup → Phone number ID (a long number, not a phone number).',
  },
  WHATSAPP_ALLOWED_SENDERS: {
    what: 'Who is allowed to write to your Notion. Everyone else is silently ignored.',
    where:
      'Your own mobile number, digits only, including country code — e.g. 447700900123 for a UK number. Comma-separate to add more people.',
  },
  SETUP_SECRET: {
    what: 'Gates this page. Without it, anyone who found this URL could create pages in your Notion.',
    where: 'You already set this — it is the key in the address bar.',
  },
}

export type MetaStep = {
  title: string
  body: string
  warn?: string
}

// The Meta setup, in the order that actually works. Order matters: step 8
// verifies by calling this app, so the app must already be live.
export const META_STEPS: MetaStep[] = [
  {
    title: 'Create a Meta app',
    body: 'Go to developers.facebook.com/apps → Create app → type "Business". Name it anything.',
  },
  {
    title: 'Add the WhatsApp product',
    body: 'In the app dashboard, add WhatsApp. Meta gives you a free test number to use straight away — no business verification, no cost.',
    warn:
      'Do not register your own phone number. A number attached to the Cloud API can no longer be used in the normal WhatsApp app. Use the test number Meta gives you and message it from your personal WhatsApp.',
  },
  {
    title: 'Add yourself as a recipient',
    body: 'WhatsApp → API Setup → "To" → Manage phone number list → add your own mobile. You will get a code to confirm. The test number can message up to 5 confirmed people.',
  },
  {
    title: 'Copy the Phone number ID',
    body: 'Same screen: WhatsApp → API Setup → Phone number ID. Put it in Vercel as WHATSAPP_PHONE_NUMBER_ID.',
  },
  {
    title: 'Copy the App Secret',
    body: 'App Settings → Basic → App Secret → Show. Put it in Vercel as WHATSAPP_APP_SECRET.',
  },
  {
    title: 'Create a permanent access token',
    body: 'Business Settings → Users → System Users → Add. Give it your app under "Add Assets", then Generate new token, tick whatsapp_business_messaging, and set expiry to Never. Put it in Vercel as WHATSAPP_TOKEN.',
    warn:
      'The temporary token on the API Setup page expires in 24 hours. If you use it, your assistant will work today and go silent tomorrow, and it will look exactly like the code is broken. This step is not optional.',
  },
  {
    title: 'Redeploy, then come back here',
    body: 'In Vercel: Deployments → the top one → ⋯ → Redeploy. Environment variables do nothing until you redeploy. Then reload this page and run "Test my credentials" above — get everything green before the next step.',
  },
  {
    title: 'Point the webhook at this app',
    body: 'WhatsApp → Configuration → Webhook → Edit. Paste the Callback URL and Verify token shown below, then click "Verify and save". Meta calls this app to check it is real, which is why the app had to be deployed first.',
  },
  {
    title: 'Subscribe to messages',
    body: 'Same screen, under Webhook fields: find "messages" and click Subscribe. Nothing will ever arrive until you do this — it is the most commonly missed step.',
  },
]

export const TRY_IT = [
  { say: 'remind me to email the plumber on Friday', gets: 'a checkbox in Todo with a Friday date chip' },
  {
    say: 'learned that defaults should change as users gain trust',
    gets: 'a bullet under this month in Learnings',
  },
  { say: 'what if onboarding had a voice-first mode', gets: 'a bullet under this month in Musings' },
]
