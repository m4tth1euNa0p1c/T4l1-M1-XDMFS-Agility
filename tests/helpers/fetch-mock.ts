export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

/** Minimal fetch double: routes by pathname, records every request. */
export function mockFetch(routes: Record<string, Route | unknown>) {
  const calls: RecordedRequest[] = [];
  const fn = async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [
        k.toLowerCase(),
        v,
      ]),
    );
    calls.push({
      url: input,
      method: init.method ?? "GET",
      headers,
      ...(typeof init.body === "string" ? { body: init.body } : {}),
    });
    const route = routes[url.pathname];
    if (route === undefined) return json({ message: "not found" }, 404);
    if (typeof route === "function") return (route as Route)(url, init);
    if (route instanceof Response) return route.clone();
    return json(route);
  };
  return { fetch: fn, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
