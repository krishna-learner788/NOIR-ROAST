// CORS for the browser-called functions (create-order, verify-payment). They authenticate with a
// Bearer token, not cookies, so a wildcard origin is safe; set ALLOWED_ORIGIN to pin it to the site.
const origin = () => Deno.env.get('ALLOWED_ORIGIN') ?? '*'

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': origin(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
})

export function withCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() })
    const res = await handler(req)
    for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v)
    return res
  }
}
