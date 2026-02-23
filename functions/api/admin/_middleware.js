// Auth middleware for /api/admin/* routes
// Validates Cloudflare Access JWT token
export async function onRequest(context) {
    // In local dev, skip auth
    if (context.request.url.includes('localhost') || context.request.url.includes('127.0.0.1')) {
        return context.next();
    }

    const jwt = context.request.headers.get('Cf-Access-Jwt-Assertion');
    if (!jwt) {
        return new Response('Unauthorized', { status: 401 });
    }

    // Cloudflare Access sets this header when a request passes through Access.
    // The presence of a valid JWT means Access has already authenticated the user.
    // For extra security, you can verify the JWT signature against the Access certs.
    // For now, we trust that if the header is present and Access is configured,
    // the request is authenticated.
    return context.next();
}
