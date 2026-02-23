// DELETE /api/admin/images/:id — delete an image from library and R2
export async function onRequestDelete(context) {
    const { DB, R2_BUCKET } = context.env;
    const id = context.params.id;

    // Check image exists
    const image = await DB.prepare('SELECT id, r2_key FROM images WHERE id = ?').bind(id).first();
    if (!image) {
        return Response.json({ error: 'Image not found' }, { status: 404 });
    }

    // Check if image is used in any slide
    const usage = await DB.prepare('SELECT id FROM slide_images WHERE r2_key = ?').bind(image.r2_key).first();
    if (usage) {
        return Response.json({ error: 'Image is assigned to a slide. Remove it from the slide first.' }, { status: 409 });
    }

    // Delete full and half variants from R2
    const halfKey = image.r2_key.replace('.jpg', '_half.jpg');
    await Promise.all([
        R2_BUCKET.delete(image.r2_key),
        R2_BUCKET.delete(halfKey)
    ]);

    // Delete from D1
    await DB.prepare('DELETE FROM images WHERE id = ?').bind(id).run();

    return Response.json({ success: true });
}
