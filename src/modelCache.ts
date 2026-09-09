/**
 * Caches fetched assets (OCR model weights, charset) in the browser's Cache Storage so
 * a returning user doesn't re-download several MB on every visit. Falls back to a plain
 * fetch (no caching) if the Cache API isn't available (e.g. very old browsers).
 */
const CACHE_NAME = "ticket-scanner-model-assets-v1";

async function fetchCached(url: string): Promise<Response> {
  if (typeof caches !== "undefined") {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url);
    if (cached) return cached;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch model asset ${url}: ${response.status} ${response.statusText}`);
    }
    await cache.put(url, response.clone());
    return response;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch model asset ${url}: ${response.status} ${response.statusText}`);
  }
  return response;
}

export async function fetchModelBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetchCached(url);
  return response.arrayBuffer();
}

export async function fetchTextAsset(url: string): Promise<string> {
  const response = await fetchCached(url);
  return response.text();
}
