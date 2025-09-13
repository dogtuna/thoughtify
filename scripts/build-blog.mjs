#!/usr/bin/env node
/*
  Simple static blog generator for Vite + Firebase Hosting.
  - Reads Markdown posts with frontmatter from `content/blog/*.md`
  - Outputs static HTML files to `public/blog/<slug>/index.html`
  - Generates `public/blog/index.html` (listing), `public/rss.xml`, `public/sitemap.xml`, `public/robots.txt`
  - Adds basic JSON-LD Article schema and Open Graph tags

  Frontmatter fields supported:
    title: string (required)
    description: string
    date: YYYY-MM-DD or ISO (defaults to file mtime)
    author: string
    slug: string (defaults to filename without extension)
    coverImage: string (path or URL)
    tags: [string, ...]

  Configure site URL via env var `SITE_URL` (e.g., https://example.com)
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.resolve(ROOT, 'content', 'blog');
const OUT_DIR = path.resolve(ROOT, 'public');
const BLOG_OUT = path.join(OUT_DIR, 'blog');

// Best-effort SITE_URL detection with common fallbacks
const SITE_URL = (
  process.env.SITE_URL ||
  process.env.APP_BASE_URL ||
  process.env.VITE_SITE_URL ||
  ''
).replace(/\/$/, '') || 'https://example.com';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function toSlug(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function fmtDate(date) {
  try {
    const d = new Date(date);
    // RFC 822 for RSS, ISO 8601 elsewhere
    return {
      iso: d.toISOString(),
      rss: d.toUTCString(),
      short: d.toISOString().slice(0, 10),
    };
  } catch {
    const d = new Date();
    return { iso: d.toISOString(), rss: d.toUTCString(), short: d.toISOString().slice(0, 10) };
  }
}

function renderLayout({
  title,
  description,
  canonical,
  coverImage,
  author,
  dateISO,
  tags = [],
  bodyHtml,
}) {
  const ogImage = coverImage ? (coverImage.startsWith('http') ? coverImage : `${SITE_URL}${coverImage.startsWith('/') ? '' : '/'}${coverImage}`) : '';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description,
    datePublished: dateISO,
    dateModified: dateISO,
    author: author ? { '@type': 'Person', name: author } : undefined,
    mainEntityOfPage: canonical,
    image: ogImage || undefined,
  };
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Thoughtify</title>
    <meta name="description" content="${escapeHtml(description || '')}" />
    <link rel="canonical" href="${canonical}" />
    <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description || '')}" />
    <meta property="og:url" content="${canonical}" />
    ${ogImage ? `<meta property="og:image" content="${ogImage}" />` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description || '')}" />
    ${ogImage ? `<meta name="twitter:image" content="${ogImage}" />` : ''}
    <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;line-height:1.7;margin:0;color:#111}
      header,main,footer{max-width:860px;margin:0 auto;padding:16px}
      header{padding-top:32px}
      h1{line-height:1.2;margin:0 0 0.5rem}
      .meta{color:#555;margin-bottom:1.25rem}
      article img{max-width:100%;height:auto;border-radius:8px}
      article pre{overflow:auto;background:#0b1020;color:#e6e6e6;padding:12px;border-radius:8px}
      article code{background:#f4f5f7;padding:2px 4px;border-radius:4px}
      a{color:#3b82f6;text-decoration:none}
      a:hover{text-decoration:underline}
      nav a{margin-right:12px}
    </style>
  </head>
  <body>
    <header>
      <nav>
        <a href="/">Home</a>
        <a href="/blog/">Blog</a>
        <a href="/privacy">Privacy</a>
      </nav>
    </header>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">${author ? escapeHtml(author) + ' • ' : ''}${new Date(dateISO).toDateString()}${tags && tags.length ? ' • ' + tags.map(escapeHtml).join(', ') : ''}</div>
      <article>
        ${bodyHtml}
      </article>
    </main>
    <footer>
      <p>© ${new Date().getFullYear()} Thoughtify</p>
    </footer>
  </body>
</html>`;
}

function renderIndex({ posts }) {
  const items = posts
    .map((p) => {
      return `<li>
        <a href="/blog/${p.slug}/"><strong>${escapeHtml(p.title)}</strong></a>
        <div class="meta">${p.date.short}${p.author ? ' • ' + escapeHtml(p.author) : ''}${p.tags?.length ? ' • ' + p.tags.map(escapeHtml).join(', ') : ''}</div>
        <p>${escapeHtml(p.description || '')}</p>
      </li>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Blog | Thoughtify</title>
    <meta name="description" content="Latest posts and updates from Thoughtify" />
    <link rel="canonical" href="${SITE_URL}/blog/" />
    <meta name="robots" content="index,follow" />
    <link rel="alternate" type="application/rss+xml" title="Thoughtify RSS" href="${SITE_URL}/rss.xml" />
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Helvetica,Arial,sans-serif;line-height:1.7;margin:0;color:#111}
      header,main,footer{max-width:860px;margin:0 auto;padding:16px}
      header{padding-top:32px}
      h1{line-height:1.2;margin:0 0 0.5rem}
      ul{list-style:none;padding:0}
      li{padding:16px 0;border-bottom:1px solid #eee}
      a{color:#3b82f6;text-decoration:none}
      a:hover{text-decoration:underline}
      .meta{color:#555;margin-top:4px}
      nav a{margin-right:12px}
    </style>
  </head>
  <body>
    <header>
      <nav>
        <a href="/">Home</a>
        <a href="/blog/">Blog</a>
        <a href="/privacy">Privacy</a>
      </nav>
      <h1>Blog</h1>
      <p>Stories, updates and ideas from Thoughtify.</p>
    </header>
    <main>
      <ul>${items}</ul>
    </main>
    <footer>
      <p>© ${new Date().getFullYear()} Thoughtify</p>
    </footer>
  </body>
</html>`;
}

function renderRSS({ posts }) {
  const items = posts
    .map((p) => `
      <item>
        <title>${escapeHtml(p.title)}</title>
        <link>${SITE_URL}/blog/${p.slug}/</link>
        <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}/</guid>
        <pubDate>${p.date.rss}</pubDate>
        <description>${escapeHtml(p.description || '')}</description>
      </item>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Thoughtify</title>
    <link>${SITE_URL}</link>
    <description>Thoughtify blog feed</description>
    ${items}
  </channel>
  </rss>`;
}

function renderSitemap({ posts }) {
  const urls = posts
    .map((p) => `
    <url>
      <loc>${SITE_URL}/blog/${p.slug}/</loc>
      <lastmod>${p.date.iso}</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.7</priority>
    </url>`)
    .join('\n');
  // Include the blog index itself
  const blogIndex = `
    <url>
      <loc>${SITE_URL}/blog/</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>0.8</priority>
    </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${blogIndex}
  ${urls}
</urlset>`;
}

function ensureRobotsTxt() {
  const p = path.join(OUT_DIR, 'robots.txt');
  if (fs.existsSync(p)) return; // don't overwrite existing
  const robots = `# Allow all search and AI crawlers
User-agent: *
Allow: /

# Notable AI crawlers
User-agent: GPTBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
  fs.writeFileSync(p, robots, 'utf8');
}

function readPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.md') || f.endsWith('.mdx'))
    .map((f) => path.join(CONTENT_DIR, f));
  const posts = files.map((file) => {
    const src = fs.readFileSync(file, 'utf8');
    const stat = fs.statSync(file);
    const { data, content } = matter(src);
    const title = data.title || path.basename(file).replace(/\.(md|mdx)$/i, '');
    const slug = (data.slug && toSlug(data.slug)) || toSlug(title);
    const description = data.description || '';
    const dateRaw = data.date || stat.mtime.toISOString();
    const date = fmtDate(dateRaw);
    const author = data.author || '';
    const tags = Array.isArray(data.tags) ? data.tags : (data.tags ? String(data.tags).split(',').map((t) => t.trim()) : []);
    const coverImage = data.coverImage || '';
    const html = marked.parse(content);
    return {
      file,
      title,
      slug,
      description,
      date,
      author,
      tags,
      coverImage,
      html,
    };
  });
  // Newest first
  posts.sort((a, b) => new Date(b.date.iso) - new Date(a.date.iso));
  return posts;
}

function writePosts(pages) {
  ensureDir(BLOG_OUT);
  for (const p of pages) {
    const dir = path.join(BLOG_OUT, p.slug);
    ensureDir(dir);
    const canonical = `${SITE_URL}/blog/${p.slug}/`;
    const html = renderLayout({
      title: p.title,
      description: p.description,
      canonical,
      coverImage: p.coverImage,
      author: p.author,
      dateISO: p.date.iso,
      tags: p.tags,
      bodyHtml: p.html,
    });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  }
}

function writeIndex(posts) {
  ensureDir(BLOG_OUT);
  const html = renderIndex({ posts });
  fs.writeFileSync(path.join(BLOG_OUT, 'index.html'), html, 'utf8');
}

function writeFeeds(posts) {
  const rss = renderRSS({ posts });
  fs.writeFileSync(path.join(OUT_DIR, 'rss.xml'), rss, 'utf8');
  const sitemap = renderSitemap({ posts });
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap.xml'), sitemap, 'utf8');
}

function main() {
  ensureDir(CONTENT_DIR);
  ensureDir(BLOG_OUT);
  const posts = readPosts();
  writePosts(posts);
  writeIndex(posts);
  writeFeeds(posts);
  ensureRobotsTxt();
  const count = posts.length;
  console.log(`Built ${count} blog ${count === 1 ? 'post' : 'posts'} → public/blog`);
}

main();
