// GET /api/admin/images — list all images in library
export async function onRequestGet(context) {
    const { DB } = context.env;

    const { results } = await DB.prepare(
        'SELECT id, r2_key, filename, width, height, size_bytes, uploaded_at FROM images ORDER BY uploaded_at DESC'
    ).all();

    const images = results.map(img => ({
        ...img,
        src: `/images/${img.r2_key}`
    }));

    return Response.json({ images });
}

// POST /api/admin/images — upload a new image
export async function onRequestPost(context) {
    const { DB, R2_BUCKET } = context.env;

    const formData = await context.request.formData();
    const file = formData.get('image');
    const width = parseInt(formData.get('width'));
    const height = parseInt(formData.get('height'));
    const filename = formData.get('filename') || 'image.jpg';

    if (!file) {
        return Response.json({ error: 'Image file required' }, { status: 400 });
    }

    if (!width || !height) {
        return Response.json({ error: 'Width and height required' }, { status: 400 });
    }

    // Generate R2 key
    const key = crypto.randomUUID() + '.jpg';

    // Store in R2
    await R2_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: 'image/jpeg' }
    });

    // Record in D1
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await DB.prepare(
        'INSERT INTO images (id, r2_key, filename, width, height, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, key, filename, width, height, file.size).run();

    return Response.json({
        id,
        r2_key: key,
        src: `/images/${key}`,
        filename,
        width,
        height,
        size_bytes: file.size
    }, { status: 201 });
}
