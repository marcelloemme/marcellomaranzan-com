// PUT /api/admin/upload/:key — stream file directly to R2 (no body size limit)
export async function onRequestPut(context) {
    const { R2_BUCKET } = context.env;
    const key = context.params.key;

    if (!key) {
        return Response.json({ error: 'Key required' }, { status: 400 });
    }

    // Determine content type from extension
    const contentType = key.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';

    // Stream request body directly to R2 — no buffering in Worker memory
    await R2_BUCKET.put(key, context.request.body, {
        httpMetadata: { contentType }
    });

    return Response.json({ success: true, key });
}
