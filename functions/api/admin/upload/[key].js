// POST /api/admin/upload/:key — create multipart upload
export async function onRequestPost(context) {
    const { R2_BUCKET } = context.env;
    const key = context.params.key;
    const contentType = key.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';

    const multipart = await R2_BUCKET.createMultipartUpload(key, {
        httpMetadata: { contentType }
    });

    return Response.json({ uploadId: multipart.uploadId, key });
}

// PUT /api/admin/upload/:key — single file upload OR multipart part/complete
export async function onRequestPut(context) {
    const { R2_BUCKET } = context.env;
    const key = context.params.key;
    const url = new URL(context.request.url);
    const uploadId = url.searchParams.get('uploadId');
    const partNumber = url.searchParams.get('partNumber');
    const complete = url.searchParams.get('complete');

    // Simple single-file upload (small files, no multipart)
    if (!uploadId) {
        const contentType = key.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
        await R2_BUCKET.put(key, context.request.body, {
            httpMetadata: { contentType }
        });
        return Response.json({ success: true, key });
    }

    const multipart = R2_BUCKET.resumeMultipartUpload(key, uploadId);

    // Complete the upload
    if (complete === '1') {
        const parts = await context.request.json();
        await multipart.complete(parts);
        return Response.json({ success: true, key });
    }

    // Upload a single part
    if (!partNumber) {
        return Response.json({ error: 'partNumber required' }, { status: 400 });
    }

    const part = await multipart.uploadPart(parseInt(partNumber), context.request.body);

    return Response.json({
        partNumber: part.partNumber,
        etag: part.etag
    });
}

// DELETE /api/admin/upload/:key — abort multipart upload
export async function onRequestDelete(context) {
    const { R2_BUCKET } = context.env;
    const key = context.params.key;
    const url = new URL(context.request.url);
    const uploadId = url.searchParams.get('uploadId');

    if (!uploadId) {
        return Response.json({ error: 'uploadId required' }, { status: 400 });
    }

    const multipart = R2_BUCKET.resumeMultipartUpload(key, uploadId);
    await multipart.abort();

    return Response.json({ success: true });
}
