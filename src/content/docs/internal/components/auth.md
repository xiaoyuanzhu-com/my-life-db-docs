---
title: "Authentication"
---

The auth system supports three modes configured via `MLD_AUTH_MODE` environment variable.

| Mode | Description | Use Case |
|------|-------------|----------|
| `none` | No authentication (default) | Local development, single-user |
| `password` | Simple password auth | Basic protection |
| `oauth` | OIDC/OAuth 2.0 | Production, SSO integration |

## Configuration

```bash
# Auth mode (required)
MLD_AUTH_MODE=none|password|oauth

# OAuth (required when mode=oauth)
MLD_OAUTH_CLIENT_ID=your-client-id
MLD_OAUTH_CLIENT_SECRET=your-secret
MLD_OAUTH_ISSUER_URL=https://your-idp.com
MLD_OAUTH_REDIRECT_URI=https://your-app.com/api/oauth/callback

# Single-user filter (optional) — rejects logins from other usernames
MLD_EXPECTED_USERNAME=user@domain.com
```

OIDC discovery is automatic — the backend fetches `/.well-known/openid-configuration` from the issuer URL.

## API Routes

### OAuth

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/oauth/authorize` | GET | Start OAuth flow — redirects to IdP |
| `/api/oauth/callback` | GET | OAuth callback — receives auth code from IdP |
| `/api/oauth/token` | GET | Validate current token, return user info |
| `/api/oauth/refresh` | POST | Refresh access token |
| `/api/oauth/logout` | POST | Clear auth cookies |

### Password

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/auth/login` | POST | Login with password |
| `/api/auth/logout` | POST | Logout, clear session cookie |

### Route Protection

All `/api/*` routes (except auth endpoints) are protected by `AuthMiddleware` when `MLD_AUTH_MODE != "none"`. The middleware checks:

- **OAuth mode** — validates `access_token` cookie (or `Authorization: Bearer <token>` header) against the OIDC provider
- **Password mode** — validates `session` cookie against the database

Unauthorized requests receive `401` with `{"error": "Unauthorized", "code": "INVALID_TOKEN"|"INVALID_SESSION"}`.

## OAuth Login Flow

Two variants depending on whether the client can receive cookies directly.

### Cookie-based (web browsers)

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Backend
    participant IdP as OIDC Provider

    C->>B: GET /api/oauth/authorize
    Note over B: generate random state<br/>set oauth_state cookie
    B->>IdP: 302 redirect
    Note over IdP: user authenticates
    IdP->>B: callback with code
    Note over C: GET /api/oauth/callback<br/>?code=...&state=...
    B->>IdP: exchange code
    IdP->>B: access + refresh token
    Note over B: verify ID token<br/>validate username
    B->>C: set cookies + 302 /
```

After the redirect, the client has `access_token` and `refresh_token` cookies. All subsequent API calls include them automatically.

### Redirect-based (native clients)

For clients that can't receive HTTP cookies (native apps, CLI tools), pass `native_redirect` to get tokens back via URL redirect instead:

```mermaid
sequenceDiagram
    participant C as Client
    participant B as Backend
    participant IdP as OIDC Provider

    C->>B: GET /api/oauth/authorize<br/>?native_redirect=myscheme://oauth/callback
    Note over B,IdP: ... same IdP flow as above ...
    B->>C: 302 myscheme://oauth/callback<br/>?access_token=...&refresh_token=...&expires_in=...
```

The client receives tokens as URL query parameters, stores them in platform-appropriate secure storage, and sends them via `Authorization: Bearer <token>` header on subsequent requests.

### Cookies

| Cookie | Max-Age | Path | Scope |
|--------|---------|------|-------|
| `access_token` | Token's expiry (~1h) | `/` | All API calls |
| `refresh_token` | 30 days | `/api/oauth` | Refresh endpoint only |
| `oauth_state` | 5 minutes | `/api/oauth` | CSRF validation during login |

All cookies are `HttpOnly`. `Secure` is set in production.

### Token Validation

```
GET /api/oauth/token
Authorization: Bearer <access_token>  (or access_token cookie)

200 { "authenticated": true, "username": "...", "sub": "...", "email": "..." }
401 { "authenticated": false, "error": "invalid_token" }
```

### Token Refresh

The refresh endpoint accepts the refresh token from **two sources** — each client type uses whichever is natural:

| Client | Sends refresh token via |
|--------|------------------------|
| Web browser | `Cookie: refresh_token=…` (auto-sent by browser) |
| Native app | JSON body `{"refresh_token": "…"}` |
| Hybrid WebView | Delegates to native (see [Hybrid App Auth](#hybrid-app-auth-native--webview)) |

The backend checks the cookie first, then falls back to the request body:

```
POST /api/oauth/refresh

# Web clients — browser sends cookie automatically
Cookie: refresh_token=...

# Native clients — send in JSON body
Content-Type: application/json
{ "refresh_token": "..." }

200 {
  "success": true,
  "access_token": "new-token",
  "refresh_token": "new-or-same",
  "expiresIn": 3600
}
Set-Cookie: access_token=...; refresh_token=...

401  (refresh token expired or invalid)
```

The response always includes both `Set-Cookie` headers (for cookie-based clients) and a JSON body (for native clients). Each client uses whichever is appropriate — web browsers store the cookies, native apps read the JSON body and save to secure storage.

## Password Auth Flow

```
POST /api/auth/login
Content-Type: application/json
{ "password": "..." }

200 { "success": true, "sessionId": "..." }
Set-Cookie: session=<64-char-hex-token>; Max-Age=2592000; Path=/; HttpOnly; Secure

401 { "error": "Invalid password" }
```

- First login with no stored password creates one (bootstrap)
- Sessions are stored in the `sessions` table (30-day expiry, extended on use)
- Logout clears the `session` cookie

## Client Integration Guide

### Auth check

No dedicated "am I logged in?" endpoint is needed. Any protected API call works:

1. Call any API endpoint (e.g. `GET /api/settings`)
2. `200` → authenticated
3. `401` → not authenticated (or token expired — see refresh below)

### Transparent token refresh

Clients should handle token refresh **in the API/networking layer** so that application code never deals with auth. The recommended pattern:

```mermaid
graph TD
    subgraph App["Application code"]
        A1["api.get('/api/inbox') — just works"]
        A2["api.post('/api/files') — just works"]
    end

    subgraph APILayer["API layer (intercepts all requests)"]
        S1["1. Make the request"]
        S1 --> S2{"Response?"}
        S2 -- "200" --> S3["Return response"]
        S2 -- "401" --> S4["Attempt refresh once"]
        S4 --> S5["POST /api/oauth/refresh"]
        S5 -- "succeeds" --> S6["Update stored token\nRetry original request\nReturn retried response"]
        S5 -- "fails" --> S7["Signal 'unauthenticated'\nto app layer"]
    end

    App --> APILayer
```

This keeps auth invisible to feature code. The app layer only needs to handle the final "unauthenticated" signal (e.g. show login screen).

#### Concurrent 401 handling

When multiple requests fail with 401 simultaneously, clients must deduplicate refresh attempts. While one refresh is in-flight, queue other failed requests and retry them after it resolves. Use a mutex / single-flight pattern to prevent multiple concurrent refresh calls.

### Foreground resume check

On mobile, when the app returns to foreground after being backgrounded, check if the token is expiring soon (< 2 min) and refresh if so. This avoids a guaranteed 401 on the next API call after a long background period.

This is a lightweight supplement to the reactive 401-based refresh (the required baseline). **Do not use timer-based proactive refresh** (e.g., scheduling a refresh at JWT exp − 60s) — timers don't fire reliably when the OS suspends the app, waste refresh cycles when the app is idle, and add complexity with no benefit over the 401-based flow.

### Auth state

Clients typically expose a simple auth state to the UI:

| State | Meaning |
|-------|---------|
| `unknown` | App just launched, haven't checked yet |
| `checking` | Validating token or refreshing |
| `authenticated` | Valid session, user info available |
| `unauthenticated` | No valid session, show login |

Transitions: `unknown` → `checking` → `authenticated` or `unauthenticated`. The API layer's refresh failure triggers `authenticated` → `unauthenticated`.

### SSE / long-lived connections

SSE endpoints like `/api/notifications/stream` are protected by the same `AuthMiddleware` — auth is validated **once** when the connection is established. These connections differ from normal API calls in two important ways:

1. **No mid-stream 401.** The middleware checks auth before the handler runs. If the token is expired, the client receives a 401 and the SSE stream never opens. There is no in-band auth error during an active stream.
2. **No automatic retry-with-refresh.** Unlike `fetchWithRefresh` where the wrapper can intercept a 401, retry refresh, and replay the request transparently, SSE connections must handle auth failure in the reconnect logic.

#### Web clients (EventSource)

Use **cookie-based auth only** — never pass tokens as query parameters. The browser's `EventSource` reuses the URL on reconnect; a stale token baked into the query string causes infinite 401 loops.

```typescript
// Correct — cookie is sent automatically and updates after refresh
const es = new EventSource('/api/notifications/stream');

// Wrong — stale token baked into URL
const es = new EventSource(`/api/notifications/stream?token=${token}`);
```

Per the [WHATWG spec](https://html.spec.whatwg.org/multipage/server-sent-events.html), `EventSource` does **not** auto-reconnect on HTTP errors (only on connection drops after a successful 200). A 401 sets `readyState = CLOSED` and fires `onerror` once. The client must manage reconnection:

```
onerror fires → close EventSource → refresh token → wait (with backoff) → create new EventSource
```

#### Native clients (URLSession / OkHttp)

Native HTTP clients receive the full HTTP response before streaming starts. The delegate/callback **must check the status code** before treating the connection as successful:

```
didReceive response:
  → if 401: reject (don't reset backoff)
  → if 200: accept, reset backoff
```

:::caution
A common bug: resetting the reconnect backoff on *any* HTTP response (including 401). This defeats exponential backoff and produces rapid-fire retry loops — the server sees ~1 request/second indefinitely.
:::

#### Reconnect backoff requirements

All clients must implement exponential backoff on SSE reconnection failure:

| Client | Base delay | Backoff | Cap | Reset on |
|--------|-----------|---------|-----|----------|
| Web (EventSource) | 5s | 2× | 60s | Successful `onopen` or visibility change |
| Native (URLSession) | 1s | 2× | 30s | Successful 200 response |

The reconnect cycle should attempt a token refresh before each retry, but must still apply backoff regardless of whether the refresh succeeded.

## Hybrid App Auth (Native + WebView)

Native apps that embed WebViews (iOS, Android, desktop) need auth in **two networking stacks**: native HTTP client (for native API calls) and the WebView (for embedded web content). The recommended pattern is **cookie injection** — native owns all tokens and injects them as cookies into the WebView's cookie store.

### Architecture: native owns auth

```
AuthManager (singleton, secure storage)
  │
  ├── Token storage ─────── Keychain / Android Keystore (single source of truth)
  ├── Foreground check ──── refresh if token expiring soon (< 2 min)
  ├── Reactive refresh ──── on 401 from native API calls
  ├── Single-flight ─────── concurrent callers wait for one in-flight refresh
  │
  ├── on token change ────► push cookies to all active WebViews
  │
  ├──► Native API calls          ──► Authorization: Bearer <token>
  │    (reads from secure storage)    (standard HTTP header, no cookies)
  │
  └──► WebView cookie injection  ──► document.cookie via JS
       (reads from secure storage)    (WebView uses cookies like a browser)
            ▲
            │ on WebView 401:
            │ bridge delegates refresh back to AuthManager
            │ (WebView never calls /api/oauth/refresh itself)
```

Key principle: **native is the single source of truth for tokens.** The WebView receives tokens as cookies but never refreshes them — on 401, it delegates back to native via the bridge. This eliminates dual-writer race conditions between the native and web refresh paths.

:::caution[Anti-pattern: dual token storage]
Never store tokens in both platform secure storage (Keychain) AND `HTTPCookieStorage` / `CookieManager`. Using `URLSession.shared` (iOS) or `OkHttpClient` (Android) for the refresh request will silently store the response's `Set-Cookie` tokens in the system cookie store, creating a shadow copy that can diverge from secure storage. Use a dedicated HTTP session with cookie handling disabled for auth requests:

```swift
// iOS: dedicated session for auth requests — no cookie interference
let config = URLSessionConfiguration.ephemeral
config.httpShouldSetCookies = false
config.httpCookieAcceptPolicy = .never
let authSession = URLSession(configuration: config)
```
:::

### Why cookie injection

Several patterns exist for passing auth to a WebView. Cookie injection is recommended because:

| Pattern | Intercepts fetch/XHR? | Web code changes? | Verdict |
|---------|----------------------|-------------------|---------|
| **Cookie injection** | N/A (auto-sent) | None | Recommended |
| Custom URL scheme handler | Only custom schemes | Must rewrite API URLs | Over-engineered for most cases |
| JS bridge proxy | Yes (via bridge) | Must replace all fetch calls | High overhead, breaks streaming |
| Service worker | Yes | Must register SW | Unreliable on iOS |
| Header on initial load only | No (first request only) | None | Useless for SPAs |

Cookie injection keeps the web frontend 100% standard — plain `fetch()` with `credentials: 'same-origin'`, same code in browser and WebView. Platform-specific code lives entirely in the native shell's cookie injection layer.

### Cookie injection rules

#### 1. Inject both cookies

The WebView needs both `access_token` (for API requests) and `refresh_token` (as an emergency fallback if bridge delegation fails):

| Cookie | Value source | Path | Expires |
|--------|-------------|------|---------|
| `access_token` | From secure storage | `/` | JWT `exp` claim |
| `refresh_token` | From secure storage | `/api/oauth` | 30 days from now |

#### 2. Always set explicit expiry

Never create session cookies (no `Expires`). Platform WebView processes can be killed at any time (memory pressure, background suspension), and session cookies are lost. Always set `Expires` from the JWT `exp` claim or a fixed duration.

#### 3. Inject via JavaScript, not the system cookie store

Use `document.cookie = "..."` via JavaScript evaluation instead of the platform's `HTTPCookieStorage` / `CookieManager`. This bypasses the async cookie store synchronization delay that causes race conditions on page load.

```javascript
// Inject via JS evaluation on the WebView — immediate, synchronous, no delay
document.cookie = "access_token=<token>; path=/; max-age=3600; secure; samesite=lax";
```

Platform cookie stores (`HTTPCookieStorage.shared` on iOS, `CookieManager` on Android) sync to the WebView's internal store asynchronously with unpredictable delay. JavaScript injection takes effect immediately.

:::caution
`HttpOnly` cookies cannot be set via JavaScript. Since the backend sets cookies as `HttpOnly`, the JS-injected cookies are technically duplicates that shadow the server-set cookies. This is acceptable — the JS-injected cookie ensures auth is available immediately, and the server-set `HttpOnly` cookie provides the security baseline for subsequent requests.
:::

#### 4. Inject before page load, and after every token refresh

| Event | Action |
|-------|--------|
| Before initial WebView page load | Inject cookies (via platform cookie store API is OK here since you `await` completion before loading) |
| After every native token refresh | Inject cookies via JS + signal WebView to re-check auth |
| On app foreground resume | Check token freshness, inject if refreshed |
| On WebView process crash/reload | Re-inject cookies before reload |

#### 5. Signal WebView auth changes via native bridge

After injecting new cookies (e.g., after a token refresh), dispatch a custom event so the web frontend re-checks auth state:

```javascript
// Called by native after injecting fresh cookies
window.dispatchEvent(new Event("native-recheck-auth"));
```

The web frontend listens for this event and re-validates:

```javascript
window.addEventListener("native-recheck-auth", () => {
  // Re-check auth — the cookies are already fresh
  fetch("/api/settings", { credentials: "same-origin" })
    .then(res => setIsAuthenticated(res.ok));
});
```

:::note
Dispatch this event **after** cookie injection, not before. On initial page load, add a short delay (~200ms) to ensure React has mounted its event listeners.
:::

#### 6. WebView delegates refresh to native

When the WebView's web frontend encounters a 401, it must **not** call `/api/oauth/refresh` directly. Instead, it delegates to the native layer via the bridge:

```javascript
// In fetchWithRefresh (web frontend):
async function refreshAccessToken() {
    if (window.__nativeBridge) {
        // Hybrid WebView — delegate to native AuthManager
        const result = await window.__nativeBridge.requestTokenRefresh();
        return result.success;  // native refreshed + pushed new cookies
    }
    // Standalone browser — refresh via cookie as usual
    const res = await fetch('/api/oauth/refresh', { method: 'POST', credentials: 'same-origin' });
    return res.ok;
}
```

This keeps native as the single token writer. The refresh token cookie injected in [rule 1](#1-inject-both-cookies) exists as an **emergency fallback** — if the bridge call fails or the native process is unresponsive, the web-side `fetchWithRefresh` can still refresh via cookie. But the primary path is always bridge → native → push cookies.

**Never** store the refresh token in JavaScript-accessible storage (localStorage, sessionStorage, JS variables). The injected cookie is scoped to `/api/oauth` path and is only sent to the refresh endpoint.

### Lifecycle: foreground resume refresh pushes to WebView

```mermaid
sequenceDiagram
    participant AM as AuthManager
    participant KS as Secure Storage
    participant WV as WebView
    participant BE as Backend

    Note over AM: App returns to foreground<br/>token expiring soon (< 2 min)
    AM->>KS: Read refresh_token
    AM->>BE: POST /api/oauth/refresh<br/>Body: { refresh_token: ... }
    Note over AM: Uses dedicated HTTP session<br/>(no cookie storage)
    BE->>AM: 200 { access_token, refresh_token, expiresIn }
    AM->>KS: Save new tokens (verify write succeeded)
    AM->>WV: JS: document.cookie = "access_token=<new>"
    AM->>WV: JS: document.cookie = "refresh_token=<new>"
    AM->>WV: JS: window.dispatchEvent("native-recheck-auth")
```

### Lifecycle: WebView 401 — bridge delegation

When the web frontend inside a WebView encounters a 401, it delegates refresh to native instead of calling the refresh endpoint directly:

```mermaid
sequenceDiagram
    participant React as Web Frontend
    participant Bridge as Native Bridge
    participant AM as AuthManager
    participant KS as Secure Storage
    participant BE as Backend

    React->>BE: fetch('/api/inbox') with cookie
    BE->>React: 401 Unauthorized
    Note over React: fetchWithRefresh detects 401
    React->>Bridge: requestTokenRefresh()
    Bridge->>AM: refreshAccessToken()
    AM->>KS: Read refresh_token
    AM->>BE: POST /api/oauth/refresh<br/>Body: { refresh_token: ... }
    BE->>AM: 200 { access_token, refresh_token }
    AM->>KS: Save new tokens
    AM->>React: JS: document.cookie = "access_token=<new>"
    AM->>React: JS: document.cookie = "refresh_token=<new>"
    Bridge->>React: { success: true }
    React->>BE: Retry fetch('/api/inbox') with new cookie
    BE->>React: 200 OK
```

This keeps AuthManager as the single writer. The WebView never holds refresh state — it just receives fresh cookies from native after each refresh.

### Lifecycle: initial page load

```mermaid
sequenceDiagram
    participant AM as AuthManager
    participant WV as WebView
    participant React as React App

    AM->>AM: checkAuth() — validate token
    Note over AM: state = authenticated
    AM->>WV: Inject cookies (platform API, awaited)
    AM->>WV: Load page URL
    WV->>React: Page loads, React mounts
    React->>React: AuthProvider.checkAuth() via fetch
    Note over React: Cookie is present — 200 OK
    Note over React: isAuthenticated = true
    Note over AM: After .finished event + 200ms delay:
    AM->>WV: JS: window.dispatchEvent("native-recheck-auth")
    Note over React: Re-checks auth (defensive, handles edge cases)
```

### Lifecycle: WebView process crash

WebView processes can be terminated by the OS at any time. On crash recovery:

1. Re-inject cookies from secure storage (they may have been lost)
2. Reload the page
3. The normal "initial page load" flow takes over

### Platform implementation notes

| Platform | Secure storage | Cookie injection (pre-load) | Cookie injection (runtime) |
|----------|---------------|---------------------------|---------------------------|
| iOS / macOS | Keychain | `WKHTTPCookieStore.setCookie()` (awaited) | `webView.evaluateJavaScript("document.cookie=...")` |
| Android | Android Keystore | `CookieManager.setCookie()` | `webView.evaluateJavascript("document.cookie=...")` |
| Desktop (Electron) | OS keychain / safeStorage | `session.cookies.set()` | `webContents.executeJavaScript("document.cookie=...")` |

For the new SwiftUI `WebPage` API (iOS 26+), use `webPage.callJavaScript()` for runtime injection. For pre-load injection, `HTTPCookieStorage.shared` syncs to the WebView's internal store — but **always await the sync** before calling `webPage.load()`.

### What the web frontend needs

The web frontend runs the same code in browser and WebView. The only behavioral difference is **how token refresh works**:

| Context | How `fetchWithRefresh` refreshes | Why |
|---------|--------------------------------|-----|
| **Standalone browser** | `POST /api/oauth/refresh` with cookies | Browser manages cookies natively |
| **Inside native WebView** | Calls `window.__nativeBridge.requestTokenRefresh()` | Native is the single auth owner |

The detection is a one-line check in the refresh function — `window.__nativeBridge` is set by the native bridge polyfill before React mounts.

Other requirements:

1. **Listen for `native-recheck-auth`** — re-check auth when native signals a token change (after refresh or foreground resume)
2. **Detect native context** — `window.isNativeApp` (set by native bridge polyfill) to hide browser-only UI like login redirects
3. **`fetchWithRefresh` cookie fallback stays** — if the bridge call fails (native process unresponsive), fall through to the standard cookie-based refresh as a safety net

No special API URL schemes, no fetch overrides, no bridge proxying. Standard `fetch()` with `credentials: 'same-origin'`.

## Key Files

| Component | Location |
|-----------|----------|
| Auth mode detection | `backend/auth/oauth.go` |
| OIDC provider setup | `backend/auth/oidc_provider.go` |
| Auth middleware | `backend/api/middleware.go` |
| OAuth handlers | `backend/api/oauth.go` |
| Password handlers | `backend/api/auth.go` |
| Session storage | `backend/db/sessions.go` |
| Route registration | `backend/api/routes.go` |
