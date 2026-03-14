// PUT /api/admin/folders/:id — rename a folder
export async function onRequestPut(context) {
    const { DB } = context.env;
    const id = context.params.id;
    const { name } = await context.request.json();

    if (!name || !name.trim()) {
        return Response.json({ error: 'Folder name is required' }, { status: 400 });
    }

    const folder = await DB.prepare('SELECT id FROM folders WHERE id = ?').bind(id).first();
    if (!folder) {
        return Response.json({ error: 'Folder not found' }, { status: 404 });
    }

    await DB.prepare('UPDATE folders SET name = ? WHERE id = ?').bind(name.trim(), id).run();

    return Response.json({ success: true });
}

// DELETE /api/admin/folders/:id — delete a folder (must be empty)
export async function onRequestDelete(context) {
    const { DB } = context.env;
    const id = context.params.id;

    const folder = await DB.prepare('SELECT id FROM folders WHERE id = ?').bind(id).first();
    if (!folder) {
        return Response.json({ error: 'Folder not found' }, { status: 404 });
    }

    // Check for subfolders
    const subfolder = await DB.prepare('SELECT id FROM folders WHERE parent_id = ? LIMIT 1').bind(id).first();
    if (subfolder) {
        return Response.json({ error: 'Folder contains subfolders. Remove them first.' }, { status: 409 });
    }

    // Check for images
    const image = await DB.prepare('SELECT id FROM images WHERE folder_id = ? LIMIT 1').bind(id).first();
    if (image) {
        return Response.json({ error: 'Folder contains images. Move or delete them first.' }, { status: 409 });
    }

    await DB.prepare('DELETE FROM folders WHERE id = ?').bind(id).run();

    return Response.json({ success: true });
}
