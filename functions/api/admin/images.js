// GET /api/admin/images — list images, optionally filtered by folder
export async function onRequestGet(context) {
    const { DB } = context.env;
    const url = new URL(context.request.url);
    const folderId = url.searchParams.get('folder_id');
    let query, bind;
    if (folderId === 'root') {
        query = 'SELECT id, r2_key, filename, width, height, size_bytes, file_type, folder_id, uploaded_at FROM images WHERE folder_id IS NULL ORDER BY filename';
        bind = [];
    } else if (folderId) {
        query = 'SELECT id, r2_key, filename, width, height, size_bytes, file_type, folder_id, uploaded_at FROM images WHERE folder_id = ? ORDER BY filename';
        bind = [folderId];
    } else {
        query = 'SELECT id, r2_key, filename, width, height, size_bytes, file_type, folder_id, uploaded_at FROM images ORDER BY filename';
        bind = [];
    }

    const stmt = DB.prepare(query);
    const { results } = bind.length ? await stmt.bind(...bind).all() : await stmt.all();

    const images = results.map(img => {
        const isPdf = img.file_type === 'pdf';
        return {
            ...img,
            src: `/images/${img.r2_key}`,
            src_half: isPdf
                ? `/images/${img.r2_key.replace('.pdf', '_thumb.jpg')}`
                : `/images/${img.r2_key.replace('.jpg', '_half.jpg')}`
        };
    });

    return Response.json({ images });
}

// POST /api/admin/images — two modes:
//   1. action=prepare: returns r2_key for direct upload (no file in body)
//   2. action=commit (or legacy): registers file in D1, optionally stores thumbnail
export async function onRequestPost(context) {
    const { DB, R2_BUCKET } = context.env;

    const formData = await context.request.formData();
    const action = formData.get('action') || 'legacy';

    // === PREPARE: generate R2 key, return it so client can PUT directly ===
    if (action === 'prepare') {
        const fileType = formData.get('file_type') || 'image';
        const isPdf = fileType === 'pdf';
        const ext = isPdf ? '.pdf' : '.jpg';
        const key = crypto.randomUUID() + ext;
        return Response.json({ r2_key: key });
    }

    // === COMMIT: save thumbnail to R2 + record in D1 ===
    if (action === 'commit') {
        const r2Key = formData.get('r2_key');
        const thumbFile = formData.get('image_half');
        const width = parseInt(formData.get('width'));
        const height = parseInt(formData.get('height'));
        const filename = formData.get('filename') || 'file';
        const folderId = formData.get('folder_id') || null;
        const fileType = formData.get('file_type') || 'image';
        const sizeBytes = parseInt(formData.get('size_bytes')) || 0;

        if (!r2Key || !width || !height) {
            return Response.json({ error: 'r2_key, width, height required' }, { status: 400 });
        }

        // Store thumbnail in R2
        if (thumbFile) {
            const isPdf = fileType === 'pdf';
            const thumbKey = isPdf
                ? r2Key.replace('.pdf', '_thumb.jpg')
                : r2Key.replace('.jpg', '_half.jpg');
            await R2_BUCKET.put(thumbKey, thumbFile.stream(), {
                httpMetadata: { contentType: 'image/jpeg' }
            });
        }

        // Record in D1
        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        await DB.prepare(
            'INSERT INTO images (id, r2_key, filename, width, height, size_bytes, file_type, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, r2Key, filename, width, height, sizeBytes, fileType, folderId).run();

        const isPdf = fileType === 'pdf';
        return Response.json({
            id,
            r2_key: r2Key,
            src: `/images/${r2Key}`,
            src_half: isPdf
                ? `/images/${r2Key.replace('.pdf', '_thumb.jpg')}`
                : `/images/${r2Key.replace('.jpg', '_half.jpg')}`,
            filename, width, height,
            size_bytes: sizeBytes,
            file_type: fileType,
            folder_id: folderId
        }, { status: 201 });
    }

    // === LEGACY: original single-request upload (small files) ===
    const file = formData.get('image');
    const fileHalf = formData.get('image_half');
    const width = parseInt(formData.get('width'));
    const height = parseInt(formData.get('height'));
    const filename = formData.get('filename') || 'file';
    const folderId = formData.get('folder_id') || null;
    const fileType = formData.get('file_type') || 'image';

    if (!file) {
        return Response.json({ error: 'File required' }, { status: 400 });
    }

    if (!width || !height) {
        return Response.json({ error: 'Width and height required' }, { status: 400 });
    }

    const isPdf = fileType === 'pdf';
    const ext = isPdf ? '.pdf' : '.jpg';
    const key = crypto.randomUUID() + ext;

    await R2_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType: isPdf ? 'application/pdf' : 'image/jpeg' }
    });

    if (fileHalf) {
        const thumbKey = isPdf
            ? key.replace('.pdf', '_thumb.jpg')
            : key.replace('.jpg', '_half.jpg');
        await R2_BUCKET.put(thumbKey, fileHalf.stream(), {
            httpMetadata: { contentType: 'image/jpeg' }
        });
    }

    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await DB.prepare(
        'INSERT INTO images (id, r2_key, filename, width, height, size_bytes, file_type, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, key, filename, width, height, file.size, fileType, folderId).run();

    return Response.json({
        id, r2_key: key,
        src: `/images/${key}`,
        src_half: isPdf
            ? `/images/${key.replace('.pdf', '_thumb.jpg')}`
            : `/images/${key.replace('.jpg', '_half.jpg')}`,
        filename, width, height,
        size_bytes: file.size,
        file_type: fileType,
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

    if (folder_id) {
        const folder = await DB.prepare('SELECT id FROM folders WHERE id = ?').bind(folder_id).first();
        if (!folder) {
            return Response.json({ error: 'Folder not found' }, { status: 404 });
        }
    }

    const stmts = image_ids.map(id =>
        DB.prepare('UPDATE images SET folder_id = ? WHERE id = ?').bind(folder_id || null, id)
    );
    await DB.batch(stmts);

    return Response.json({ success: true, moved: image_ids.length });
}
