import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "wpspot.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  _db = new Database(dbPath);

  // Performance pragmas (enterprise-grade)
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.pragma("cache_size = -64000"); // 64MB cache
  _db.pragma("temp_store = MEMORY");
  _db.pragma("mmap_size = 268435456"); // 256MB mmap
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'user', -- user | admin
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sites (
      id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      subdomain       TEXT UNIQUE,
      custom_domain   TEXT UNIQUE,
      blogspot_url    TEXT,       -- e.g. https://myblog.blogspot.com
      blog_id         TEXT,       -- Blogger blog ID
      blogger_api_key TEXT,       -- Blogger API key (encrypted)
      github_repo     TEXT,       -- e.g. org/repo-name
      github_repo_url TEXT,
      status          TEXT NOT NULL DEFAULT 'pending', -- pending|deploying|active|error
      deploy_log      TEXT,
      wp_admin_user   TEXT,
      wp_admin_pass   TEXT,       -- encrypted
      wp_version      TEXT DEFAULT 'latest',
      php_version     TEXT DEFAULT '8.2',
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS domains (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      site_id     TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      domain      TEXT NOT NULL UNIQUE,
      verified    INTEGER NOT NULL DEFAULT 0,
      dns_cname   TEXT,
      dns_a       TEXT,
      ssl_status  TEXT DEFAULT 'pending',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS deploy_logs (
      id        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      site_id   TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      level     TEXT NOT NULL DEFAULT 'info', -- info|warn|error|success
      message   TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);
    CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status);
    CREATE INDEX IF NOT EXISTS idx_deploy_logs_site ON deploy_logs(site_id);
  `);
}

// ---- CRUD helpers ----

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb().prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=unixepoch()"
  ).run(key, value);
}

export function createSite(data: {
  user_id: string;
  name: string;
  blogspot_url: string;
  blog_id: string;
  blogger_api_key: string;
  wp_admin_user: string;
  wp_admin_pass: string;
}): string {
  const db = getDb();
  const subdomain = data.name.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + Math.random().toString(36).slice(2, 7);
  const result = db.prepare(`
    INSERT INTO sites (user_id, name, subdomain, blogspot_url, blog_id, blogger_api_key, wp_admin_user, wp_admin_pass)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.user_id, data.name, subdomain, data.blogspot_url, data.blog_id, data.blogger_api_key, data.wp_admin_user, data.wp_admin_pass);
  return String((result as any).lastInsertRowid || subdomain);
}

export function updateSiteStatus(siteId: string, status: string, extra: Record<string, any> = {}) {
  const db = getDb();
  const sets = ["status=?", "updated_at=unixepoch()", ...Object.keys(extra).map(k => `${k}=?`)];
  db.prepare(`UPDATE sites SET ${sets.join(",")} WHERE id=?`).run(
    status, ...Object.values(extra), siteId
  );
}

export function addDeployLog(siteId: string, level: "info"|"warn"|"error"|"success", message: string) {
  getDb().prepare("INSERT INTO deploy_logs(site_id,level,message) VALUES(?,?,?)").run(siteId, level, message);
}
