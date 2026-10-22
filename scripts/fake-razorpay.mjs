// Stand-alone FAKE Razorpay API for local browser testing (npm run dev:fake-razorpay).
// It is NOT Razorpay: it answers the two API calls our Edge Functions make (create order, fetch
// payment) on http://localhost:4010 and lets a test register the payment a stubbed Checkout made.
import { startFakeRazorpay, LOCAL } from '../tests/integration/helpers.js'

const fake = await startFakeRazorpay()
console.log(`Fake Razorpay listening on :${LOCAL.fakePort} (key id ${LOCAL.keyId}). Ctrl+C to stop.`)
process.on('SIGINT', async () => { await fake.close(); process.exit(0) })
await new Promise(() => {})
