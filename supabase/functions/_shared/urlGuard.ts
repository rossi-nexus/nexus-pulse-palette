/**
 * SSRF guard for edge functions that fetch user-supplied URLs.
 *
 * - Only http/https, no embedded credentials.
 * - Blocks localhost, .local/.internal names, and cloud metadata hosts.
 * - Resolves DNS and rejects private/reserved/link-local IPs (v4 + v6).
 * - safeFetch follows redirects manually, re-validating every hop.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast + reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const n = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (n === "::" || n === "::1") return true;
  if (n.startsWith("fe8") || n.startsWith("fe9") || n.startsWith("fea") || n.startsWith("feb")) return true; // link-local
  if (n.startsWith("fc") || n.startsWith("fd")) return true; // ULA
  if (n.startsWith("::ffff:")) return isPrivateIPv4(n.slice(7)); // v4-mapped
  return false;
}

const IPV4_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }
  const host = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost")
  ) {
    throw new Error("Blocked hostname");
  }
  if (IPV4_RE.test(host)) {
    if (isPrivateIPv4(host)) throw new Error("Blocked IP address");
    return url;
  }
  if (host.includes(":") || raw.includes("[")) {
    if (isPrivateIPv6(host)) throw new Error("Blocked IP address");
    return url;
  }
  // Resolve DNS and verify all answers are public.
  const [a, aaaa] = await Promise.all([
    Deno.resolveDns(host, "A").catch(() => [] as string[]),
    Deno.resolveDns(host, "AAAA").catch(() => [] as string[]),
  ]);
  const ips = [...a, ...aaaa];
  if (ips.length === 0) throw new Error(`Could not resolve host: ${host}`);
  for (const ip of ips) {
    if ((ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip))) {
      throw new Error("Hostname resolves to a blocked IP address");
    }
  }
  return url;
}

const MAX_REDIRECTS = 5;

/**
 * Drop-in replacement for fetch(url, { redirect: "follow" }) that validates
 * the initial URL and every redirect hop against the SSRF rules above.
 */
export async function safeFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let current = (await assertSafeUrl(input)).href;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const resp = await fetch(current, { ...init, redirect: "manual" });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) return resp;
      try {
        await resp.body?.cancel();
      } catch { /* ignore */ }
      current = (await assertSafeUrl(new URL(loc, current).href)).href;
      continue;
    }
    return resp;
  }
  throw new Error("Too many redirects");
}
