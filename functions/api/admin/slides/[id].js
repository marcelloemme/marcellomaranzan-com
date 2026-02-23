// PUT /api/admin/slides/:id — update an existing slide
export async function onRequestPut(context) {
    const { DB } = context.env;
    const id = context.params.id;
    const body = await context.request.json();
    const { layout, images } = body;

    // Check slide exists
    const slide = await DB.prepare('SELECT id FROM slides WHERE id = ?').bind(id).first();
    if (!slide) {
        return Response.json({ error: 'Slide not found' }, { status: 404 });
    }

    if (!layout || !['duo', 'solo'].includes(layout)) {
        return Response.json({ error: 'Invalid layout' }, { status: 400 });
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
        return Response.json({ error: 'Images required' }, { status: 400 });
    }

    // Validate roles match layout
    if (layout === 'duo') {
        const roles = images.map(i => i.role).sort();
        if (roles.length !== 2 || roles[0] !== 'left' || roles[1] !== 'right') {
            return Response.json({ error: 'Duo layout requires left and right images' }, { status: 400 });
        }
    } else {
        if (images.length !== 1 || images[0].role !== 'wide') {
            return Response.json({ error: 'Solo layout requires one wide image' }, { status: 400 });
        }
    }

    // Update layout
    const statements = [
        DB.prepare('UPDATE slides SET layout = ? WHERE id = ?').bind(layout, id),
        // Remove old slide_images
        DB.prepare('DELETE FROM slide_images WHERE slide_id = ?').bind(id)
    ];

    // Re-create slide_images
    for (const img of images) {
        const siId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const libImg = await DB.prepare('SELECT r2_key, width, height FROM images WHERE id = ?')
            .bind(img.image_id).first();

        if (!libImg) {
            return Response.json({ error: `Image ${img.image_id} not found` }, { status: 400 });
        }

        statements.push(
            DB.prepare('INSERT INTO slide_images (id, slide_id, role, r2_key, caption, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .bind(siId, id, img.role, libImg.r2_key, img.caption || '', libImg.width, libImg.height)
        );
    }

    await DB.batch(statements);

    return Response.json({ success: true });
}

// DELETE /api/admin/slides/:id — delete a slide
export async function onRequestDelete(context) {
    const { DB } = context.env;
    const id = context.params.id;

    // Check slide exists
    const slide = await DB.prepare('SELECT id FROM slides WHERE id = ?').bind(id).first();
    if (!slide) {
        return Response.json({ error: 'Slide not found' }, { status: 404 });
    }

    // Delete slide_images first (D1 doesn't enforce ON DELETE CASCADE by default)
    await DB.batch([
        DB.prepare('DELETE FROM slide_images WHERE slide_id = ?').bind(id),
        DB.prepare('DELETE FROM slides WHERE id = ?').bind(id)
    ]);

    // Re-number positions to keep them sequential
    const { results } = await DB.prepare('SELECT id FROM slides ORDER BY position ASC').all();
    if (results.length > 0) {
        const statements = results.map((row, i) =>
            DB.prepare('UPDATE slides SET position = ? WHERE id = ?').bind(i, row.id)
        );
        await DB.batch(statements);
    }

    return Response.json({ success: true });
}
