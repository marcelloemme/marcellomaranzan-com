/**
 * Auth middleware for /admin/* routes
 *
 * Protects admin panel with username + password.
 * Cookie mm_auth: Max-Age 14h, HttpOnly, Secure.
 *
 * Environment variables (set as secrets in Cloudflare Pages):
 * - ADMIN_USER: admin username
 * - ADMIN_PASSWORD: admin password
 * - AUTH_SECRET: HMAC signing key for cookie
 */

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Allow static assets through (CSS, JS loaded by admin page)
  if (
    path.endsWith('.css') ||
    path.endsWith('.js') ||
    path.endsWith('.ico') ||
    path.endsWith('.png') ||
    path.endsWith('.svg')
  ) {
    return next();
  }

  // POST login: verify credentials
  if (request.method === 'POST' && path === '/admin/__auth') {
    const formData = await request.formData();
    const username = formData.get('username');
    const password = formData.get('password');

    if (username === env.ADMIN_USER && password === env.ADMIN_PASSWORD) {
      const token = await generateToken(env.AUTH_SECRET);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/admin/',
          'Set-Cookie': `mm_auth=${token}; Max-Age=50400; Path=/; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }

    // Wrong credentials
    return loginPage(true);
  }

  // Verify cookie
  const cookie = parseCookie(request.headers.get('Cookie') || '', 'mm_auth');
  if (cookie && await verifyToken(cookie, env.AUTH_SECRET)) {
    return next();
  }

  // No valid cookie: show login
  return loginPage(false);
}

// Generate HMAC token
async function generateToken(secret) {
  const timestamp = Date.now().toString();
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(timestamp)
  );
  const hex = [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${timestamp}.${hex}`;
}

// Verify HMAC token + 14h expiry
async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, hex] = parts;
  const age = Date.now() - parseInt(timestamp);
  if (isNaN(age) || age > 50400000 || age < 0) return false; // 14h in ms

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const expected = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(timestamp)
  );
  const expectedHex = [...new Uint8Array(expected)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === expectedHex;
}

// Parse cookie by name
function parseCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

// Login page HTML
function loginPage(error) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>Login - Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #000;
      color: #fff;
      padding: env(safe-area-inset-top, 0) 1rem env(safe-area-inset-bottom, 0);
    }
    form {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      max-width: 400px;
    }
    input {
      width: 100%;
      font-size: 16px;
      padding: 0.75rem 1rem;
      border: 1px solid #2a2b2d;
      border-radius: 8px;
      background: #1a1a1a;
      color: #fff;
      text-align: center;
      outline: none;
    }
    input:focus { border-color: #6a6b6d; }
    input::placeholder { color: #8a8f98; }
    button {
      width: 100%;
      font-size: 16px;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 8px;
      background: #fff;
      color: #000;
      cursor: pointer;
      margin-top: 0.25rem;
    }
    button:hover, button:active { opacity: 0.6; }
    .error { color: #b00020; font-size: 14px; }
    @media (prefers-color-scheme: light) {
      body { background: #fff; color: #222; }
      input { border-color: #ddd; background: #fff; color: #222; }
      input:focus { border-color: #000; }
      input::placeholder { color: #9aa0a6; }
      button { background: #000; color: #fff; }
    }
  </style>
</head>
<body>
  <form method="POST" action="/admin/__auth">
    <input type="text" name="username" placeholder="Username" autocomplete="username" autofocus>
    <input type="password" name="password" placeholder="Password" autocomplete="current-password">
    ${error ? '<p class="error">Invalid credentials</p>' : ''}
    <button type="submit">Log in</button>
  </form>
</body>
</html>`;

  return new Response(html, {
    status: 401,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
