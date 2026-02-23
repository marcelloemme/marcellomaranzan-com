// GET /images/:key — serve image from R2 with cache headers
export async function onRequestGet(context) {
    const key = context.params.key;
    const object = await context.env.R2_BUCKET.get(key);

    if (!object) {
        return new Response('Not found', { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('ETag', object.httpEtag);

    return new Response(object.body, { headers });
}
