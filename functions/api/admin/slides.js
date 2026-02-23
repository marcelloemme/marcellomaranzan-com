// POST /api/admin/slides — create a new slide
export async function onRequestPost(context) {
    const { DB } = context.env;
    const body = await context.request.json();

    const { layout, images } = body;

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

    // Get next position
    const posResult = await DB.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM slides').first();
    const position = posResult.next_pos;

    // Create slide
    const slideId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const statements = [
        DB.prepare('INSERT INTO slides (id, layout, position) VALUES (?, ?, ?)')
            .bind(slideId, layout, position)
    ];

    // Create slide_images
    for (const img of images) {
        const siId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        // Look up the image in the library to get r2_key, width, height
        const libImg = await DB.prepare('SELECT r2_key, width, height FROM images WHERE id = ?')
            .bind(img.image_id).first();

        if (!libImg) {
            return Response.json({ error: `Image ${img.image_id} not found` }, { status: 400 });
        }

        statements.push(
            DB.prepare('INSERT INTO slide_images (id, slide_id, role, r2_key, caption, width, height) VALUES (?, ?, ?, ?, ?, ?, ?)')
                .bind(siId, slideId, img.role, libImg.r2_key, img.caption || '', libImg.width, libImg.height)
        );
    }

    await DB.batch(statements);

    return Response.json({ id: slideId, layout, position }, { status: 201 });
}

// PUT /api/admin/slides — reorder slides
export async function onRequestPut(context) {
    const { DB } = context.env;
    const body = await context.request.json();

    const { order } = body;
    if (!order || !Array.isArray(order)) {
        return Response.json({ error: 'Order array required' }, { status: 400 });
    }

    const statements = order.map((id, i) =>
        DB.prepare('UPDATE slides SET position = ? WHERE id = ?').bind(i, id)
    );

    await DB.batch(statements);

    return Response.json({ success: true });
}
