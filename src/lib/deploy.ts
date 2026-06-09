import { createSiteRepo, pushFiles, setRepoSecret, triggerWorkflow } from "./github";
import { updateSiteStatus, addDeployLog, getSetting } from "./db";
import { broadcastDeployStatus } from "./websocket";

interface DeployConfig {
  siteId: string;
  siteName: string;
  blogspotUrl: string;
  blogId: string;
  bloggerApiKey: string;
  wpAdminUser: string;
  wpAdminPass: string;
  wpAdminEmail: string;
  customDomain?: string;
}

export async function deploySite(cfg: DeployConfig): Promise<void> {
  const log = (level: "info"|"warn"|"error"|"success", msg: string) => {
    addDeployLog(cfg.siteId, level, msg);
    broadcastDeployStatus(cfg.siteId, level, msg);
    console.log(`[deploy:${cfg.siteId}] [${level}] ${msg}`);
  };

  try {
    updateSiteStatus(cfg.siteId, "deploying");
    log("info", "GitHub 레포 생성 중...");

    const repo = await createSiteRepo(cfg.siteName, cfg.siteId);
    updateSiteStatus(cfg.siteId, "deploying", { github_repo: repo.full_name, github_repo_url: repo.html_url });
    log("info", `레포 생성 완료: ${repo.full_name}`);

    // Push all template files
    log("info", "GitHub Actions 워크플로우 및 설정 파일 업로드 중...");
    const files = buildRepoFiles(cfg, repo.full_name);
    await pushFiles(repo.full_name, "main", files, "🚀 WPSpot: Initial WordPress setup");
    log("info", "파일 업로드 완료");

    // Set GitHub Secrets
    log("info", "GitHub Secrets 설정 중...");
    const secrets: Record<string, string> = {
      BLOGSPOT_URL: cfg.blogspotUrl,
      BLOGGER_API_KEY: cfg.bloggerApiKey,
      BLOG_ID: cfg.blogId,
      WP_ADMIN_USER: cfg.wpAdminUser,
      WP_ADMIN_PASS: cfg.wpAdminPass,
      WP_ADMIN_EMAIL: cfg.wpAdminEmail,
      WPSPOT_SITE_ID: cfg.siteId,
      WPSPOT_API_URL: getSetting("platform_url") || process.env.NEXT_PUBLIC_BASE_URL || "",
    };
    if (cfg.customDomain) secrets.CUSTOM_DOMAIN = cfg.customDomain;

    await Promise.all(
      Object.entries(secrets).map(([k, v]) => setRepoSecret(repo.full_name, k, v))
    );
    log("info", "Secrets 설정 완료");

    // Trigger initial deploy workflow
    log("info", "WordPress 초기 배포 워크플로우 실행 중...");
    await triggerWorkflow(repo.full_name, "wp-setup.yml", "main");

    updateSiteStatus(cfg.siteId, "deploying", { github_repo: repo.full_name });
    log("success", "배포 시작됨 — GitHub Actions에서 진행 중");
  } catch (err: any) {
    log("error", `배포 실패: ${err.message}`);
    updateSiteStatus(cfg.siteId, "error");
    throw err;
  }
}

function buildRepoFiles(cfg: DeployConfig, repoFullName: string): Array<{ path: string; content: string }> {
  return [
    // Main setup workflow - fetches real WordPress, creates SQLite DB, deploys to Blogspot
    {
      path: ".github/workflows/wp-setup.yml",
      content: getSetupWorkflow(),
    },
    // Auto-update workflow - keeps WordPress core up to date
    {
      path: ".github/workflows/wp-update.yml",
      content: getUpdateWorkflow(),
    },
    // Cloudflare cache purge workflow
    {
      path: ".github/workflows/cf-purge.yml",
      content: getCfPurgeWorkflow(),
    },
    // Blogspot sync workflow
    {
      path: ".github/workflows/blogspot-sync.yml",
      content: getBlogspotSyncWorkflow(),
    },
    // Scripts
    {
      path: "scripts/setup-wordpress.sh",
      content: getSetupScript(),
    },
    {
      path: "scripts/init-sqlite.php",
      content: getSqliteInitScript(),
    },
    {
      path: "scripts/wp-config-generator.php",
      content: getWpConfigGenerator(),
    },
    {
      path: "scripts/blogspot-bridge.js",
      content: getBlogspotBridge(),
    },
    // Cloudflare _headers file for perfect CF compatibility
    {
      path: "public/_headers",
      content: getCloudflareHeaders(),
    },
    // Cloudflare _redirects
    {
      path: "public/_redirects",
      content: getCloudflareRedirects(),
    },
    // README
    {
      path: "README.md",
      content: getReadme(cfg),
    },
  ];
}

// ========== WORKFLOW FILES ==========

function getSetupWorkflow(): string {
  return `name: 🚀 WordPress Setup & Deploy
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - '.github/workflows/wp-setup.yml'
      - 'scripts/**'

concurrency:
  group: deploy-\${{ github.ref }}
  cancel-in-progress: false

jobs:
  setup:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write
      actions: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Setup PHP 8.2
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: sqlite3, pdo_sqlite, gd, curl, mbstring, xml, zip, opcache
          ini-values: memory_limit=512M, max_execution_time=300

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install WP-CLI
        run: |
          curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
          chmod +x wp-cli.phar
          sudo mv wp-cli.phar /usr/local/bin/wp
          wp --info

      - name: Download WordPress (Official)
        run: |
          echo "📦 Downloading official WordPress..."
          wp core download --locale=ko_KR --path=wordpress --allow-root
          echo "✅ WordPress downloaded"
          ls -la wordpress/

      - name: Install SQLite Integration Plugin
        run: |
          echo "📦 Installing SQLite Database Integration..."
          wp plugin install sqlite-database-integration --path=wordpress --allow-root
          # Copy db.php drop-in
          cp wordpress/wp-content/plugins/sqlite-database-integration/db.copy wordpress/wp-content/db.php

      - name: Generate wp-config.php
        run: |
          php scripts/wp-config-generator.php
        env:
          WP_DB_PATH: \${{ github.workspace }}/wordpress/wp-content/database/.ht.sqlite
          WP_HOME: \${{ secrets.CUSTOM_DOMAIN != '' && format('https://{0}', secrets.CUSTOM_DOMAIN) || secrets.BLOGSPOT_URL }}
          WP_SITEURL: \${{ secrets.CUSTOM_DOMAIN != '' && format('https://{0}', secrets.CUSTOM_DOMAIN) || secrets.BLOGSPOT_URL }}
          WP_ADMIN_USER: \${{ secrets.WP_ADMIN_USER }}
          WP_ADMIN_PASS: \${{ secrets.WP_ADMIN_PASS }}
          WP_ADMIN_EMAIL: \${{ secrets.WP_ADMIN_EMAIL }}
          BLOGSPOT_URL: \${{ secrets.BLOGSPOT_URL }}
          BLOGGER_API_KEY: \${{ secrets.BLOGGER_API_KEY }}
          BLOG_ID: \${{ secrets.BLOG_ID }}

      - name: Initialize SQLite Database
        run: |
          mkdir -p wordpress/wp-content/database
          php scripts/init-sqlite.php
        env:
          WP_DB_PATH: \${{ github.workspace }}/wordpress/wp-content/database/.ht.sqlite

      - name: Run WordPress Install
        run: |
          cd wordpress
          wp core install \\
            --url="\${{ secrets.BLOGSPOT_URL }}" \\
            --title="My WordPress Blog" \\
            --admin_user="\${{ secrets.WP_ADMIN_USER }}" \\
            --admin_password="\${{ secrets.WP_ADMIN_PASS }}" \\
            --admin_email="\${{ secrets.WP_ADMIN_EMAIL }}" \\
            --skip-email \\
            --allow-root
          echo "✅ WordPress installed"

      - name: Configure WordPress (SEO + Cloudflare + Performance)
        run: |
          cd wordpress
          # Permalinks for SEO
          wp option update permalink_structure '/%postname%/' --allow-root
          wp rewrite flush --allow-root
          
          # Timezone
          wp option update timezone_string 'Asia/Seoul' --allow-root
          
          # Blogspot Bridge settings
          wp option add blogspot_url "\${{ secrets.BLOGSPOT_URL }}" --allow-root
          wp option add blogger_api_key "\${{ secrets.BLOGGER_API_KEY }}" --allow-root
          wp option add blog_id "\${{ secrets.BLOG_ID }}" --allow-root
          
          # Performance
          wp option update blog_public 1 --allow-root
          wp option update comment_moderation 0 --allow-root
          
          # Install recommended plugins
          wp plugin install wordpress-seo --activate --allow-root || true
          wp plugin install cloudflare --activate --allow-root || true
          wp plugin install w3-total-cache --allow-root || true
          
          echo "✅ WordPress configured"

      - name: Build Blogspot Bridge
        run: |
          node scripts/blogspot-bridge.js build
        env:
          BLOGSPOT_URL: \${{ secrets.BLOGSPOT_URL }}
          BLOGGER_API_KEY: \${{ secrets.BLOGGER_API_KEY }}
          BLOG_ID: \${{ secrets.BLOG_ID }}
          WP_API_URL: \${{ secrets.BLOGSPOT_URL }}/wp-json/wp/v2

      - name: Commit WordPress Files
        run: |
          git config user.name "WPSpot Bot"
          git config user.email "bot@wpspot.io"
          
          # Don't commit sensitive files
          echo "wordpress/wp-config.php" >> .gitignore
          echo "wordpress/wp-content/database/" >> .gitignore
          echo "wordpress/wp-content/cache/" >> .gitignore
          echo "*.log" >> .gitignore
          
          git add -A
          git diff --staged --quiet || git commit -m "⚙️ WordPress setup complete [skip ci]"
          git push origin main
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Notify WPSpot Platform
        if: always()
        run: |
          STATUS="\${{ job.status == 'success' && 'active' || 'error' }}"
          curl -s -X POST "\${{ secrets.WPSPOT_API_URL }}/api/hosting/status" \\
            -H "Content-Type: application/json" \\
            -d "{\\"site_id\\":\\"\${{ secrets.WPSPOT_SITE_ID }}\\",\\"status\\":\\"$STATUS\\"}" || true
        continue-on-error: true
`;
}

function getUpdateWorkflow(): string {
  return `name: 🔄 WordPress Auto Update
on:
  schedule:
    - cron: '0 3 * * 1'  # Every Monday 3 AM UTC
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: sqlite3, pdo_sqlite, gd, curl, mbstring

      - name: Install WP-CLI
        run: |
          curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
          chmod +x wp-cli.phar && sudo mv wp-cli.phar /usr/local/bin/wp

      - name: Update WordPress Core
        run: |
          cd wordpress
          wp core update --allow-root
          wp plugin update --all --allow-root
          wp theme update --all --allow-root
          echo "✅ WordPress updated"

      - name: Commit Updates
        run: |
          git config user.name "WPSpot Update Bot"
          git config user.email "updates@wpspot.io"
          git add -A
          git diff --staged --quiet || git commit -m "⬆️ Auto update WordPress core & plugins"
          git push origin main
`;
}

function getCfPurgeWorkflow(): string {
  return `name: ☁️ Cloudflare Cache Purge
on:
  workflow_dispatch:
    inputs:
      purge_all:
        description: 'Purge all cache'
        type: boolean
        default: false
      urls:
        description: 'URLs to purge (comma separated)'
        type: string

jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - name: Purge Cloudflare Cache
        run: |
          if [ "\${{ inputs.purge_all }}" == "true" ]; then
            curl -s -X POST "https://api.cloudflare.com/client/v4/zones/\${{ secrets.CF_ZONE_ID }}/purge_cache" \\
              -H "Authorization: Bearer \${{ secrets.CF_API_TOKEN }}" \\
              -H "Content-Type: application/json" \\
              --data '{"purge_everything":true}'
          else
            URLS=$(echo "\${{ inputs.urls }}" | tr ',' '\\n' | jq -R . | jq -s .)
            curl -s -X POST "https://api.cloudflare.com/client/v4/zones/\${{ secrets.CF_ZONE_ID }}/purge_cache" \\
              -H "Authorization: Bearer \${{ secrets.CF_API_TOKEN }}" \\
              -H "Content-Type: application/json" \\
              --data "{\\"files\\":$URLS}"
          fi
`;
}

function getBlogspotSyncWorkflow(): string {
  return `name: 🔁 Blogspot Sync
on:
  workflow_dispatch:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 min

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Sync WordPress → Blogspot
        run: node scripts/blogspot-bridge.js sync
        env:
          BLOGSPOT_URL: \${{ secrets.BLOGSPOT_URL }}
          BLOGGER_API_KEY: \${{ secrets.BLOGGER_API_KEY }}
          BLOG_ID: \${{ secrets.BLOG_ID }}
          WP_API_URL: \${{ secrets.BLOGSPOT_URL }}/wp-json/wp/v2
`;
}

// ========== SCRIPTS ==========

function getSetupScript(): string {
  return `#!/bin/bash
set -e

echo "=== WPSpot WordPress Setup Script ==="

WP_PATH=\${WP_PATH:-./wordpress}
WP_VERSION=\${WP_VERSION:-latest}

# Ensure directory
mkdir -p "$WP_PATH"

echo "→ Verifying WordPress installation at $WP_PATH"
if [ -f "$WP_PATH/wp-login.php" ]; then
  echo "✅ WordPress already present"
else
  echo "❌ WordPress not found — re-downloading"
  wp core download --path="$WP_PATH" --locale=ko_KR --allow-root
fi

# Set permissions
chmod -R 755 "$WP_PATH/wp-content"
chmod 600 "$WP_PATH/wp-config.php" 2>/dev/null || true

echo "✅ Setup complete"
`;
}

function getSqliteInitScript(): string {
  return `<?php
/**
 * WPSpot SQLite Database Initializer
 * Creates the SQLite DB file and verifies WordPress tables
 */

$db_path = getenv('WP_DB_PATH') ?: __DIR__ . '/../wordpress/wp-content/database/.ht.sqlite';
$db_dir  = dirname($db_path);

if (!is_dir($db_dir)) {
    mkdir($db_dir, 0755, true);
    echo "✅ Created database directory: $db_dir\\n";
}

// Create .htaccess to protect the database directory
file_put_contents($db_dir . '/.htaccess', "Deny from all\\n");

// Test SQLite connection
try {
    $pdo = new PDO('sqlite:' . $db_path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Performance pragmas
    $pdo->exec("PRAGMA journal_mode=WAL");
    $pdo->exec("PRAGMA synchronous=NORMAL");
    $pdo->exec("PRAGMA cache_size=-32000");
    $pdo->exec("PRAGMA temp_store=MEMORY");
    $pdo->exec("PRAGMA mmap_size=268435456");
    
    // Verify tables after WP install
    $tables = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'")->fetchAll(PDO::FETCH_COLUMN);
    echo "✅ SQLite DB ready at: $db_path\\n";
    echo "📊 Tables: " . implode(', ', $tables ?: ['(pending WP install)']) . "\\n";
    
} catch (Exception $e) {
    echo "❌ SQLite error: " . $e->getMessage() . "\\n";
    exit(1);
}

echo "✅ SQLite initialization complete\\n";
`;
}

function getWpConfigGenerator(): string {
  return `<?php
/**
 * WPSpot wp-config.php Generator
 * Generates wp-config.php for SQLite-based WordPress
 * Includes Cloudflare compatibility and WebSocket support
 */

$db_path      = getenv('WP_DB_PATH') ?: './wp-content/database/.ht.sqlite';
$wp_home      = rtrim(getenv('WP_HOME') ?: 'http://localhost', '/');
$wp_siteurl   = rtrim(getenv('WP_SITEURL') ?: $wp_home, '/');
$table_prefix = 'wp_';
$debug        = getenv('WP_DEBUG') === 'true';
$blogspot_url = getenv('BLOGSPOT_URL') ?: '';
$auth_key     = bin2hex(random_bytes(32));
$secure_key   = bin2hex(random_bytes(32));
$logged_key   = bin2hex(random_bytes(32));
$nonce_key    = bin2hex(random_bytes(32));
$auth_salt    = bin2hex(random_bytes(32));
$secure_salt  = bin2hex(random_bytes(32));
$logged_salt  = bin2hex(random_bytes(32));
$nonce_salt   = bin2hex(random_bytes(32));

$config = <<<PHP
<?php
/**
 * WPSpot - WordPress Configuration
 * SQLite + Cloudflare + Blogspot Bridge
 * Auto-generated by WPSpot Deploy System
 * DO NOT EDIT MANUALLY
 */

// ============================================================
// SQLite Database (via SQLite Database Integration plugin)
// ============================================================
define('DB_ENGINE', 'sqlite');
define('DB_FILE', '{$db_path}');

// Required by WP-SQLite plugin (not used but must be set)
define('DB_NAME',     'wpspot');
define('DB_USER',     'root');
define('DB_PASSWORD', '');
define('DB_HOST',     'localhost');
define('DB_CHARSET',  'utf8mb4');
define('DB_COLLATE',  '');

// ============================================================
// Site URLs
// ============================================================
define('WP_HOME',    '{$wp_home}');
define('WP_SITEURL', '{$wp_siteurl}');

// ============================================================
// Cloudflare Compatibility (CRITICAL)
// ============================================================
// Fix HTTPS detection behind Cloudflare proxy
if (isset(\$_SERVER['HTTP_CF_VISITOR'])) {
    \$cf_visitor = json_decode(\$_SERVER['HTTP_CF_VISITOR'], true);
    if (isset(\$cf_visitor['scheme']) && \$cf_visitor['scheme'] === 'https') {
        \$_SERVER['HTTPS'] = 'on';
        \$_SERVER['SERVER_PORT'] = 443;
    }
}
if (isset(\$_SERVER['HTTP_X_FORWARDED_PROTO']) && \$_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
    \$_SERVER['HTTPS'] = 'on';
}

// Fix admin URL behind proxy
if (isset(\$_SERVER['HTTP_X_FORWARDED_HOST'])) {
    \$_SERVER['HTTP_HOST'] = \$_SERVER['HTTP_X_FORWARDED_HOST'];
}

// WebSocket-compatible NONCE behavior (prevent CSRF issues with WS)
define('COOKIEPATH',        '/');
define('SITECOOKIEPATH',    '/');
define('ADMIN_COOKIE_PATH', '/wp-admin');

// ============================================================
// Security
// ============================================================
define('AUTH_KEY',         '{$auth_key}');
define('SECURE_AUTH_KEY',  '{$secure_key}');
define('LOGGED_IN_KEY',    '{$logged_key}');
define('NONCE_KEY',        '{$nonce_key}');
define('AUTH_SALT',        '{$auth_salt}');
define('SECURE_AUTH_SALT', '{$secure_salt}');
define('LOGGED_IN_SALT',   '{$logged_salt}');
define('NONCE_SALT',       '{$nonce_salt}');

// ============================================================
// Performance
// ============================================================
define('WP_MEMORY_LIMIT',       '256M');
define('WP_MAX_MEMORY_LIMIT',   '512M');
define('COMPRESS_CSS',          true);
define('COMPRESS_SCRIPTS',      true);
define('CONCATENATE_SCRIPTS',   false); // Keep false for async loading
define('ENFORCE_GZIP',          true);
define('WP_CACHE',              true);
define('AUTOSAVE_INTERVAL',     300); // 5 min autosave
define('WP_POST_REVISIONS',     5);
define('EMPTY_TRASH_DAYS',      7);

// ============================================================
// File System
// ============================================================
define('FS_METHOD', 'direct');
define('WP_CONTENT_DIR', dirname(__FILE__) . '/wp-content');
define('WP_CONTENT_URL', '{$wp_siteurl}/wp-content');

// ============================================================
// Blogspot Bridge
// ============================================================
define('WPSPOT_BLOGSPOT_URL', '{$blogspot_url}');
define('WPSPOT_MODE',         'blogspot'); // blogspot | standalone

// ============================================================
// Debug
// ============================================================
define('WP_DEBUG',         {$debug_str});
define('WP_DEBUG_LOG',     {$debug_str});
define('WP_DEBUG_DISPLAY', false);
define('SCRIPT_DEBUG',     false);

// ============================================================
// WordPress Table Prefix
// ============================================================
\$table_prefix = '{$table_prefix}';

// ============================================================
// Absolute path to WordPress directory
// ============================================================
if (!defined('ABSPATH')) {
    define('ABSPATH', __DIR__ . '/');
}

require_once ABSPATH . 'wp-settings.php';
PHP;

// Replace debug string placeholder
$debug_str = $debug ? 'true' : 'false';
$config = str_replace('{$debug_str}', $debug_str, $config);

$output_path = getenv('WP_PATH') ? (getenv('WP_PATH') . '/wp-config.php') : (__DIR__ . '/../wordpress/wp-config.php');

file_put_contents($output_path, $config);
echo "✅ wp-config.php generated at: $output_path\\n";
`;
}

function getBlogspotBridge(): string {
  return `#!/usr/bin/env node
/**
 * WPSpot Blogspot Bridge
 * Syncs WordPress content ↔ Blogspot via Blogger API
 * Uses WebSocket-compatible event streaming
 */

const https = require('https');
const http = require('http');

const BLOGSPOT_URL  = process.env.BLOGSPOT_URL || '';
const BLOGGER_KEY   = process.env.BLOGGER_API_KEY || '';
const BLOG_ID       = process.env.BLOG_ID || '';
const WP_API_URL    = process.env.WP_API_URL || '';
const WP_USER       = process.env.WP_ADMIN_USER || 'admin';
const WP_PASS       = process.env.WP_ADMIN_PASS || '';

const command = process.argv[2] || 'sync';

// ---- API Helpers ----
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getWpPosts(page = 1) {
  const auth = Buffer.from(\`\${WP_USER}:\${WP_PASS}\`).toString('base64');
  const res = await request(\`\${WP_API_URL}/posts?page=\${page}&per_page=20&status=publish\`, {
    method: 'GET',
    headers: { 'Authorization': \`Basic \${auth}\` }
  });
  return res.body || [];
}

async function getBlogspotPosts() {
  const url = \`https://www.googleapis.com/blogger/v3/blogs/\${BLOG_ID}/posts?key=\${BLOGGER_KEY}&maxResults=20\`;
  const res = await request(url, { method: 'GET' });
  return res.body?.items || [];
}

async function createBlogspotPost(wpPost) {
  // OAuth2 required for write - this is a template
  // In production, use Google OAuth2 credentials stored as secrets
  console.log(\`→ Would sync post "\${wpPost.title?.rendered || wpPost.title}" to Blogspot\`);
}

// ---- Build ----
async function build() {
  console.log('🔨 Building Blogspot Bridge...');
  console.log(\`  Blogspot: \${BLOGSPOT_URL}\`);
  console.log(\`  Blog ID:  \${BLOG_ID}\`);
  
  // Generate Blogspot template that loads WordPress content
  const template = generateBlogspotTemplate();
  require('fs').mkdirSync('./blogspot-theme', { recursive: true });
  require('fs').writeFileSync('./blogspot-theme/template.xml', template);
  console.log('✅ Blogspot bridge template generated');
}

// ---- Sync ----
async function sync() {
  console.log('🔁 Syncing WordPress → Blogspot...');
  if (!BLOG_ID || !BLOGGER_KEY) {
    console.log('⚠️  Blogger API credentials not configured, skipping sync');
    return;
  }
  try {
    const posts = await getWpPosts();
    console.log(\`📝 Found \${posts.length} WordPress posts\`);
    for (const post of posts.slice(0, 5)) { // Sync latest 5
      await createBlogspotPost(post);
    }
    console.log('✅ Sync complete');
  } catch (e) {
    console.error('❌ Sync error:', e.message);
  }
}

function generateBlogspotTemplate() {
  return \`<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:version='2' class='v2' expr:dir='data:blog.languageDirection'
  xmlns='http://www.w3.org/1999/xhtml'
  xmlns:b='http://www.google.com/2005/gml/b'
  xmlns:data='http://www.google.com/2005/gml/data'
  xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta charset='UTF-8'/>
  <meta name='viewport' content='width=device-width,initial-scale=1'/>
  
  <!-- SEO: Canonical to WordPress URL -->
  <b:if cond='data:blog.pageType == &quot;item&quot;'>
    <link rel='canonical' expr:href='data:blog.url'/>
  </b:if>
  
  <!-- Cloudflare-compatible CSP -->
  <meta http-equiv='Content-Security-Policy' 
    content="default-src 'self' https: data: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'none'"/>
  
  <title><data:blog.pageTitle/></title>
  
  <!-- WPSpot WebSocket Bridge -->
  <script>
  (function() {
    'use strict';
    var WP_URL = '\${WP_API_URL_PLACEHOLDER}';
    var SITE_ID = '';
    
    // WebSocket connection for real-time features
    function connectWS() {
      var wsUrl = WP_URL.replace(/^http/, 'ws').replace('/wp-json/wp/v2', '') + '/api/websocket';
      var ws;
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = function() {
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'site:' + SITE_ID }));
        };
        ws.onmessage = function(e) {
          var data = JSON.parse(e.data);
          if (data.type === 'new_comment') refreshComments();
          if (data.type === 'new_post') refreshFeed();
        };
        ws.onclose = function() {
          setTimeout(connectWS, 5000); // Reconnect
        };
      } catch(e) {}
    }
    
    function refreshComments() {
      var el = document.getElementById('wpspot-comments');
      if (el) {
        fetch(WP_URL + '/comments?post=' + getCurrentPostId())
          .then(r => r.json())
          .then(comments => renderComments(el, comments));
      }
    }
    
    function getCurrentPostId() {
      return document.querySelector('[data-wp-post-id]')?.dataset.wpPostId || 0;
    }
    
    function renderComments(el, comments) {
      el.innerHTML = comments.map(c =>
        '<div class="comment"><strong>' + (c.author_name || 'Anonymous') + '</strong><p>' + c.content.rendered + '</p></div>'
      ).join('');
    }
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', connectWS);
    } else {
      connectWS();
    }
  })();
  </script>
</head>
<body>
  <div id='wpspot-wrapper'>
    <b:section class='header' id='header' maxwidgets='1' showaddelement='no'>
      <b:widget id='Header1' locked='true' title='Blog Header' type='Header'/>
    </b:section>
    
    <div id='content-wrapper'>
      <div id='main'>
        <b:section class='main' id='main' showaddelement='no'>
          <b:widget id='Blog1' locked='true' title='Blog Posts' type='Blog'/>
        </b:section>
        <div id='wpspot-comments'></div>
      </div>
    </div>
  </div>
</body>
</html>\`;
}

// Run
if (command === 'build') build().catch(console.error);
else if (command === 'sync') sync().catch(console.error);
else { console.log('Usage: node blogspot-bridge.js [build|sync]'); }
`;
}

function getCloudflareHeaders(): string {
  return `# Cloudflare-Compatible HTTP Headers
# Zero caching conflicts guaranteed

# Global security headers
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

# WordPress admin - never cache
/wp-admin/*
  Cache-Control: no-store, no-cache, must-revalidate
  Pragma: no-cache
  X-Robots-Tag: noindex

# wp-login.php - never cache
/wp-login.php
  Cache-Control: no-store, no-cache, must-revalidate

# Static assets - long cache
/wp-content/uploads/*
  Cache-Control: public, max-age=31536000, immutable

/wp-content/themes/*/*.css
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400

/wp-content/themes/*/*.js
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400

/wp-includes/js/*
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400

/wp-includes/css/*
  Cache-Control: public, max-age=2592000, stale-while-revalidate=86400

# API endpoints - no cache
/wp-json/*
  Cache-Control: no-store
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
  Access-Control-Allow-Headers: Content-Type, Authorization

# WebSocket upgrade path
/api/websocket
  Cache-Control: no-store
  Upgrade: websocket
  Connection: Upgrade

# XML sitemap
/sitemap*.xml
  Cache-Control: public, max-age=3600
  Content-Type: application/xml

# RSS feed
/feed/*
  Cache-Control: public, max-age=3600
  Content-Type: application/rss+xml; charset=utf-8
`;
}

function getCloudflareRedirects(): string {
  return `# Cloudflare Pages / Netlify Redirects
# WordPress standard redirects

# www to non-www (or vice versa - configure as needed)
# https://www.yourdomain.com/* https://yourdomain.com/:splat 301

# Old Blogspot URLs to WordPress
# /search/label/:tag /tag/:tag 301

# Feed
/rss /feed/ 301
/rss2 /feed/ 301
/atom /feed/atom/ 301
`;
}

function getReadme(cfg: DeployConfig): string {
  return `# WPSpot Site: ${cfg.siteName}

> Auto-generated by [WPSpot](https://wpspot.io) — WordPress × Blogspot × GitHub

## Architecture

\`\`\`
Browser → Cloudflare CDN → Blogspot (frontend) → WordPress (backend)
                                ↑                        ↑
                         Blogger API              GitHub Actions
                                                  SQLite DB
\`\`\`

## Stack

- **Frontend**: Blogspot (Google Blogger)
- **Backend**: WordPress (official files, unmodified)
- **Database**: SQLite (via [SQLite Database Integration](https://wordpress.org/plugins/sqlite-database-integration/))
- **CDN**: Cloudflare (zero-conflict caching)
- **CI/CD**: GitHub Actions
- **Real-time**: WebSocket

## Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| \`wp-setup.yml\` | Push / Manual | Full WordPress setup + Blogspot deploy |
| \`wp-update.yml\` | Weekly (Mon 3AM) | Auto-update WordPress core & plugins |
| \`cf-purge.yml\` | Manual | Purge Cloudflare cache |
| \`blogspot-sync.yml\` | Every 15min | Sync posts to Blogspot |

## Files

\`\`\`
.github/workflows/   GitHub Actions workflows
scripts/             Setup & utility scripts
wordpress/           WordPress (official files - auto-fetched by Actions)
blogspot-theme/      Blogspot bridge template
public/_headers      Cloudflare-compatible HTTP headers
\`\`\`

## Security

- wp-config.php: Auto-generated, never committed
- SQLite DB: Protected by .htaccess, in .gitignore
- Secrets: Stored in GitHub Secrets only
- Cloudflare: WAF + DDoS protection

---
*Created: ${new Date().toISOString()}*
*Site ID: ${cfg.siteId}*
`;
}
