CREATE TABLE IF NOT EXISTS slides (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    layout     TEXT NOT NULL CHECK (layout IN ('duo', 'solo')),
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS slide_images (
    id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    slide_id   TEXT NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('left', 'right', 'wide')),
    r2_key     TEXT NOT NULL,
    caption    TEXT DEFAULT '',
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    UNIQUE(slide_id, role)
);

CREATE TABLE IF NOT EXISTS images (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    r2_key      TEXT NOT NULL UNIQUE,
    filename    TEXT NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    size_bytes  INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slides_position ON slides(position);
CREATE INDEX IF NOT EXISTS idx_slide_images_slide ON slide_images(slide_id);
