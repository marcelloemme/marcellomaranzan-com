// GET /api/admin/settings — return all settings as key-value object
export async function onRequestGet(context) {
    const { DB } = context.env;

    const { results } = await DB.prepare('SELECT key, value FROM settings').all();

    const settings = {};
    for (const row of results) {
        settings[row.key] = row.value;
    }

    return Response.json(settings);
}

// PUT /api/admin/settings — upsert a single setting
export async function onRequestPut(context) {
    const { DB } = context.env;
    const { key, value } = await context.request.json();

    if (!key || typeof value === 'undefined') {
        return Response.json({ error: 'key and value required' }, { status: 400 });
    }

    await DB.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).bind(key, String(value)).run();

    return Response.json({ success: true });
}
