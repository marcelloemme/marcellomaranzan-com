// DELETE /api/admin/slides/:id — delete a slide
export async function onRequestDelete(context) {
    const { DB } = context.env;
    const id = context.params.id;

    // Check slide exists
    const slide = await DB.prepare('SELECT id FROM slides WHERE id = ?').bind(id).first();
    if (!slide) {
        return Response.json({ error: 'Slide not found' }, { status: 404 });
    }

    // Delete slide (slide_images cascade via ON DELETE CASCADE)
    await DB.prepare('DELETE FROM slides WHERE id = ?').bind(id).run();

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
