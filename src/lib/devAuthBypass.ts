/**
 * Auth-bypass dev guard — see prompt v3-a1.
 *
 * Bypass is active only when BOTH conditions are true:
 *   1. Build is in dev mode (import.meta.env.DEV).
 *   2. The opt-in environment variable VITE_ALLOW_AUTH_BYPASS is exactly "true".
 *
 * Production builds (import.meta.env.DEV === false) ignore the flag unconditionally.
 */
export const AUTH_BYPASS_ACTIVE =
  import.meta.env.DEV &&
  import.meta.env.VITE_ALLOW_AUTH_BYPASS === "true";
