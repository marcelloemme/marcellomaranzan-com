// GET /api/slides — public endpoint: returns all slides with images
export async function onRequestGet(context) {
    const { DB } = context.env;

    const { results } = await DB.prepare(`
        SELECT
            s.id         AS slide_id,
            s.layout,
            s.position,
            si.role,
            si.r2_key,
            si.caption,
            si.width,
            si.height,
            i.id         AS image_id
        FROM slides s
        LEFT JOIN slide_images si ON si.slide_id = s.id
        LEFT JOIN images i ON i.r2_key = si.r2_key
        ORDER BY s.position ASC, si.role ASC
    `).all();

    // Group by slide
    const slidesMap = new Map();
    for (const row of results) {
        if (!slidesMap.has(row.slide_id)) {
            slidesMap.set(row.slide_id, {
                id: row.slide_id,
                layout: row.layout,
                position: row.position,
                images: []
            });
        }
        if (row.r2_key) {
            slidesMap.get(row.slide_id).images.push({
                role: row.role,
                src: `/images/${row.r2_key}`,
                src_half: `/images/${row.r2_key.replace('.jpg', '_half.jpg')}`,
                caption: row.caption || '',
                width: row.width,
                height: row.height,
                image_id: row.image_id
            });
        }
    }

    const slides = [...slidesMap.values()];

    return Response.json({ slides }, {
        headers: {
            'Cache-Control': 'public, max-age=60',
        }
    });
}
