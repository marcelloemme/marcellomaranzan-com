// GET /api/admin/folders?parent_id= — list folders (and images) in a folder
export async function onRequestGet(context) {
    const { DB } = context.env;
    const url = new URL(context.request.url);
    const parentId = url.searchParams.get('parent_id') || null;

    // Get subfolders
    const foldersQuery = parentId
        ? DB.prepare('SELECT id, name, parent_id, created_at FROM folders WHERE parent_id = ? ORDER BY name').bind(parentId)
        : DB.prepare('SELECT id, name, parent_id, created_at FROM folders WHERE parent_id IS NULL ORDER BY name');

    const { results: folders } = await foldersQuery.all();

    // Get breadcrumb path
    const breadcrumb = [];
    if (parentId) {
        let currentId = parentId;
        while (currentId) {
            const folder = await DB.prepare('SELECT id, name, parent_id FROM folders WHERE id = ?').bind(currentId).first();
            if (!folder) break;
            breadcrumb.unshift({ id: folder.id, name: folder.name });
            currentId = folder.parent_id;
        }
    }

    return Response.json({ folders, breadcrumb });
}

// POST /api/admin/folders — create a folder
export async function onRequestPost(context) {
    const { DB } = context.env;
    const { name, parent_id } = await context.request.json();

    if (!name || !name.trim()) {
        return Response.json({ error: 'Folder name is required' }, { status: 400 });
    }

    // Verify parent exists if specified
    if (parent_id) {
        const parent = await DB.prepare('SELECT id FROM folders WHERE id = ?').bind(parent_id).first();
        if (!parent) {
            return Response.json({ error: 'Parent folder not found' }, { status: 404 });
        }
    }

    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await DB.prepare(
        'INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)'
    ).bind(id, name.trim(), parent_id || null).run();

    return Response.json({ id, name: name.trim(), parent_id: parent_id || null }, { status: 201 });
}
