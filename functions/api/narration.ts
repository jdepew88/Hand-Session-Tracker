import { handleNarrationRequest, type NarrationEnv } from '../../src/server/narration'

/**
 * Cloudflare Pages Function for `/api/narration`. All the logic, checks and
 * limits are in `src/server/narration.ts`; this only wires it to the
 * request. Without the `ANTHROPIC_API_KEY` secret it answers 503 and does
 * nothing else.
 */

interface PagesContext {
  request: Request
  env: NarrationEnv
}

export const onRequest = (context: PagesContext): Promise<Response> => handleNarrationRequest(context.request, context.env)
