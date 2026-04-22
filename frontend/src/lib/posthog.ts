import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

/** Cliente PostHog server-side (API routes e Server Components). */
export function getPostHogServer(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";
  if (!key) return null;
  if (!_client) {
    _client = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
  }
  return _client;
}

/** Captura um evento server-side. Silencioso se PostHog não estiver configurado. */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  const ph = getPostHogServer();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
  await ph.flush();
}
