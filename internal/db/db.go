package db

import (
	"database/sql"

	_ "modernc.org/sqlite"
)

type DB struct {
	*sql.DB
}

func New(path string) (*DB, error) {
	sqlDB, err := sql.Open("sqlite", path+"?_foreign_keys=on&_journal_mode=WAL")
	if err != nil {
		return nil, err
	}
	if err := sqlDB.Ping(); err != nil {
		return nil, err
	}
	return &DB{sqlDB}, nil
}

func (db *DB) Migrate() error {
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	// Idempotent column additions for existing databases.
	// ALTER TABLE fails if the column already exists — that's fine, ignore the error.
	db.Exec(`ALTER TABLE tags ADD COLUMN tag_category_id INTEGER REFERENCES tag_categories(id) ON DELETE SET NULL`)
	db.Exec(`ALTER TABLE cards ADD COLUMN tag_category_id INTEGER REFERENCES tag_categories(id) ON DELETE SET NULL`)

	// Migrate UNIQUE constraint on tags from (user_id, name) → (user_id, tag_category_id, name)
	// so the same tag name can exist in different categories. Runs only once.
	var migrated string
	db.QueryRow(`SELECT value FROM global_settings WHERE key = 'migration_v2_tags_unique'`).Scan(&migrated)
	if migrated != "1" {
		db.Exec(`PRAGMA foreign_keys = OFF`)
		db.Exec(`DROP TABLE IF EXISTS tags_migration_new`)
		db.Exec(`CREATE TABLE tags_migration_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			color TEXT NOT NULL DEFAULT '#6366f1',
			tag_category_id INTEGER REFERENCES tag_categories(id) ON DELETE SET NULL,
			UNIQUE(user_id, tag_category_id, name)
		)`)
		db.Exec(`INSERT OR IGNORE INTO tags_migration_new (id, user_id, name, color, tag_category_id)
			SELECT id, user_id, name, color, tag_category_id FROM tags`)
		db.Exec(`DROP TABLE tags`)
		db.Exec(`ALTER TABLE tags_migration_new RENAME TO tags`)
		db.Exec(`PRAGMA foreign_keys = ON`)
		db.Exec(`INSERT OR REPLACE INTO global_settings (key, value) VALUES ('migration_v2_tags_unique', '1')`)
	}
	return nil
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tag_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date DATE,
    position INTEGER NOT NULL DEFAULT 0,
    tag_category_id INTEGER REFERENCES tag_categories(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    tag_category_id INTEGER REFERENCES tag_categories(id) ON DELETE SET NULL,
    UNIQUE(user_id, tag_category_id, name)
);

CREATE TABLE IF NOT EXISTS card_tags (
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (card_id, tag_id)
);

CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO global_settings (key, value) VALUES ('app_name', 'Kanban');
INSERT OR IGNORE INTO global_settings (key, value) VALUES ('enforce_tag_category_restriction', 'false');
`
