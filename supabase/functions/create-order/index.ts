import { handleCreateOrder } from '../_shared/handlers.js'
import { withCors } from '../_shared/cors.ts'
import { buildDeps } from '../_shared/wiring.ts'

Deno.serve(withCors((req) => handleCreateOrder(req, buildDeps())))
