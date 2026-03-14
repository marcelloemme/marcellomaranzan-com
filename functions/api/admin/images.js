// GET /api/admin/images — list images, optionally filtered by folder
export async function onRequestGet(context) {
    const { DB } = context.env;
    const url = new URL(context.request.url);
    const folderId = url.searchParams.get('folder_id');
    // folder_id param: absent = all images, 'root' = root only (NULL), value = specific folder
    let query, bind;
    if (folderId === 'root') {
        query = 'SELECT id, r2_key, filename, width, height, size_bytes, folder_id, uploaded_at FROM images WHERE folder_id IS NULL ORDER BY filename';
        bind = [];
    } else if (folderId) {
        query = 'SELECT id, r2_key, filename, width, height, size_bytes, folder_id, uploaded_at FROM images WHERE folder_id = ? ORDER BY filename';
        bind = [folderId];
    } else {
        query = 'SELECT id, r2_key, filename, width, height, size_bytes, folder_id, uploaded_at FROM images ORDER BY filename';
        bind = [];
    }

    const stmt = DB.prepare(query);
    const { results } = bind.length ? await stmt.bind(...bind).all() : await stmt.all();

    const images = results.map(img => ({
        ...img,
        src: `/images/${img.r2_key}`,
        src_half: `/images/${img.r2_key.replace('.jpg', '_half.jpg')}`
    }));

    return Response.json({ images });
}

// POST /api/admin/images — upload a new image
export async function onRequestPost(context) {
    const { DB, R2_BUCKET } = context.env;

    const formData = await context.request.formData();
    const file = formData.get('image');
    const fileHalf = formData.get('image_half');
    const width = parseInt(formData.get('width'));
    const height = parseInt(formData.get('height'));
    const filename = formData.get('filename') || 'image.jpg';
    const folderId = formData.get('folder_id') || null;

    if (!file) {
        return Response.json({ error: 'Image file required' }, { status: 400 });
    }

    if (!width || !height) {
        return Response.json({ error: 'Width and height required' }, { status: 400 });
    }

    // Generate R2 keys
    const key = crypto.randomUUID() + '.jpg';
    const halfKey = key.replace('.jpg', '_half.jpg');

    // Store full in R2
    await R2_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: 'image/jpeg' }
    });

    // Store half in R2 (if provided)
    if (fileHalf) {
        await R2_BUCKET.put(halfKey, fileHalf.stream(), {
            httpMetadata: { contentType: 'image/jpeg' }
        });
    }

    // Record in D1
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await DB.prepare(
        'INSERT INTO images (id, r2_key, filename, width, height, size_bytes, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, key, filename, width, height, file.size, folderId).run();

    return Response.json({
        id,
        r2_key: key,
        src: `/images/${key}`,
        filename,
        width,
        height,
        size_bytes: file.size,
        folder_id: folderId
    }, { status: 201 });
}

// PUT /api/admin/images — move images to a folder
export async function onRequestPut(context) {
    const { DB } = context.env;
    const { image_ids, folder_id } = await context.request.json();

    if (!image_ids || !Array.isArray(image_ids) || image_ids.length === 0) {
        return Response.json({ error: 'image_ids array required' }, { status: 400 });
    }

    // Verify folder exists if specified
    if (folder_id) {
        const folder = await DB.prepare('SELECT id FROM folders WHERE id = ?').bind(folder_id).first();
        if (!folder) {
            return Response.json({ error: 'Folder not found' }, { status: 404 });
        }
    }

    // Move all images
    const stmts = image_ids.map(id =>
        DB.prepare('UPDATE images SET folder_id = ? WHERE id = ?').bind(folder_id || null, id)
    );
    await DB.batch(stmts);

    return Response.json({ success: true, moved: image_ids.length });
}
