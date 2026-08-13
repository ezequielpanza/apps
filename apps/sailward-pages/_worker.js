const UPSTREAM_ORIGIN = "https://sailward.ezequielpanza.workers.dev";

export default {
  async fetch(request) {
    const destination = new URL(request.url);
    const upstream = new URL(UPSTREAM_ORIGIN);
    destination.protocol = upstream.protocol;
    destination.host = upstream.host;
    return fetch(new Request(destination, request));
  },
};
