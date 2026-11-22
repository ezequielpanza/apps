// Preserve the existing Screen Deck service and its live screen state.
export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const upstream = new URL(incoming.pathname + incoming.search, 'https://screen-deck.ezequielpanza.chatgpt.site');
  const headers = new Headers(context.request.headers);
  headers.delete('host');
  const request = new Request(upstream, {method: context.request.method, headers, body: ['GET','HEAD'].includes(context.request.method) ? undefined : context.request.body, redirect: 'manual'});
  return fetch(request);
}
