// Called by Razorpay (server to server), not by a browser: no CORS, no JWT (verify_jwt = false in
// config.toml). Authenticity comes solely from the X-Razorpay-Signature HMAC over the raw body.
import { handleWebhook } from '../_shared/handlers.js'
import { buildDeps } from '../_shared/wiring.ts'

Deno.serve((req) => handleWebhook(req, buildDeps()))
