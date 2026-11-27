/**
 * Files from dist/client are answered by the static middleware before the app
 * is asked (see server.mjs), so the app's response hardening
 * (src/lib/security-headers.ts) never sees them: scripts, styles and fonts
 * went out with no `X-Content-Type-Options`. First in the chain, this covers
 * whatever answers.
 *
 * @param {Request} _request
 * @param {() => Response | Promise<Response>} next
 * @returns {Promise<Response>}
 */
export async function noSniff(_request, next) {
  const response = await next();
  try {
    response.headers.set('x-content-type-options', 'nosniff');
    return response;
  } catch {
    // Headers can be read-only (a redirect, a response passed on from fetch)
    const headers = new Headers(response.headers);
    headers.set('x-content-type-options', 'nosniff');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
}
