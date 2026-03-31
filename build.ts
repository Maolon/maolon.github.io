import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs'
import { globSync } from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { marked, type Tokens } from 'marked'
import { createHighlighter } from 'shiki'
import katex from 'katex'

// ── Types ───────────────────────────────────────────
interface Post {
  slug: string
  title: string
  date: string
  tags: string[]
  html: string
  description: string
  readingTime: number
  draft: boolean
  math: boolean
}

interface SiteConfig {
  title: string
  subtitle: string
  url: string
  links: { label: string; url: string }[]
  year: number
}

const config: SiteConfig = {
  title: 'Tony He',
  subtitle: 'Researcher & Engineer.\nBuilding at the intersection of AI systems and human intent.',
  url: 'https://mxlo.top',
  links: [
    { label: 'GitHub', url: 'https://github.com/Maolon' },
    { label: 'Email', url: 'mailto:tonyhe10012@gmail.com' },
  ],
  year: new Date().getFullYear(),
}

// ── Init ────────────────────────────────────────────
const DIST = 'dist'
if (existsSync(DIST)) rmSync(DIST, { recursive: true })
mkdirSync(DIST, { recursive: true })

// Templates
const T = {
  base: readFileSync('templates/base.html', 'utf-8'),
  home: readFileSync('templates/home.html', 'utf-8'),
  list: readFileSync('templates/list.html', 'utf-8'),
  post: readFileSync('templates/post.html', 'utf-8'),
  page: readFileSync('templates/page.html', 'utf-8'),
}

// Shiki highlighter
const highlighter = await createHighlighter({
  themes: ['github-dark'],
  langs: ['typescript', 'javascript', 'python', 'bash', 'json', 'go', 'rust',
          'yaml', 'html', 'css', 'markdown', 'shell', 'text', 'c', 'cpp', 'java'],
})

// ── Marked setup ────────────────────────────────────
const renderer = new marked.Renderer()

renderer.code = function ({ text, lang }: Tokens.Code): string {
  const language = lang || 'text'
  try {
    return highlighter.codeToHtml(text, { lang: language, theme: 'github-dark' })
  } catch {
    return `<pre class="shiki"><code>${escapeHtml(text)}</code></pre>`
  }
}

renderer.image = function ({ href, title, text }: Tokens.Image): string {
  // YouTube
  const ytMatch = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  if (ytMatch) {
    return `<div class="video-container"><iframe src="https://www.youtube-nocookie.com/embed/${ytMatch[1]}" title="${title || text || ''}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
  }
  // Bilibili
  const blMatch = href.match(/bilibili\.com\/video\/(BV[\w]+)/)
  if (blMatch) {
    return `<div class="video-container"><iframe src="https://player.bilibili.com/player.html?bvid=${blMatch[1]}&high_quality=1" title="${title || text || ''}" allowfullscreen loading="lazy"></iframe></div>`
  }
  // Local video
  if (/\.(mp4|webm|ogg)$/i.test(href)) {
    return `<div class="video-container"><video controls preload="metadata" playsinline><source src="${href}" type="video/${href.split('.').pop()}"></video></div>`
  }
  // Regular image
  const cap = title || text || ''
  if (cap) {
    return `<figure><img src="${href}" alt="${escapeHtml(cap)}" loading="lazy"><figcaption>${escapeHtml(cap)}</figcaption></figure>`
  }
  return `<img src="${href}" alt="${escapeHtml(text || '')}" loading="lazy">`
}

marked.use({ renderer })

// ── Process posts ───────────────────────────────────
const posts: Post[] = []
const postFiles = findMdFiles('content/posts')

for (const file of postFiles) {
  const raw = readFileSync(file, 'utf-8')
  const { data: fm, content } = matter(raw)
  if (fm.draft) continue

  const slug = path.basename(file, '.md')
  const hasMath = fm.math === true
  const processed = hasMath ? renderLatex(content) : content
  const html = await marked.parse(processed)
  const wordCount = content.replace(/```[\s\S]*?```/g, '').split(/\s+/).length
  const readingTime = Math.max(1, Math.ceil(wordCount / 200))

  posts.push({
    slug,
    title: fm.title || slug,
    date: formatDate(fm.date),
    tags: fm.tags || [],
    html,
    description: fm.description || '',
    readingTime,
    draft: false,
    math: hasMath,
  })
}

// Sort by date descending
posts.sort((a, b) => b.date.localeCompare(a.date))

// ── Write post pages ────────────────────────────────
for (let i = 0; i < posts.length; i++) {
  const p = posts[i]
  const prev = i < posts.length - 1
    ? `<a href="/posts/${posts[i + 1].slug}/">&larr; ${posts[i + 1].title}</a>`
    : ''
  const next = i > 0
    ? `<a href="/posts/${posts[i - 1].slug}/">${posts[i - 1].title} &rarr;</a>`
    : ''

  const tagsHtml = p.tags.map(t =>
    `<span class="sep"></span><a href="/tags/${slugify(t)}/" class="tag">${t}</a>`
  ).join('')

  const navHtml = (prev || next)
    ? `<nav class="post-nav">${prev || '<span></span>'}${next || '<span></span>'}</nav>`
    : ''

  const postHtml = fill(T.post, {
    title: p.title,
    date: p.date,
    readingTime: String(p.readingTime),
    tags: tagsHtml,
    content: p.html,
    postnav: navHtml,
  })

  let pageHtml = wrap(postHtml, `${p.title} - ${config.title}`, p.description, 'article', 'nav_posts', `/posts/${p.slug}/`)
  if (p.math) {
    pageHtml = pageHtml.replace('</head>', '  <link rel="stylesheet" href="/css/katex.min.css">\n</head>')
  }
  write(`posts/${p.slug}/index.html`, pageHtml)
}

// ── Write post list page ────────────────────────────
const byYear = groupBy(posts, p => p.date.slice(0, 4))
let groupsHtml = ''
for (const [year, yearPosts] of Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0]))) {
  const items = yearPosts.map(p => {
    const tags = p.tags.map(t =>
      `<a href="/tags/${slugify(t)}/" class="tag">${t}</a>`
    ).join('')
    return `<div class="post-item">
      <span class="post-date">${p.date.slice(5)}</span>
      <a href="/posts/${p.slug}/" class="post-title-link">${p.title}</a>
      <span class="post-tags">${tags}</span>
    </div>`
  }).join('\n')

  groupsHtml += `<div class="year-group">
    <div class="year-label">${year}</div>
    ${items}
  </div>\n`
}

const listHtml = fill(T.list, { section_title: 'Posts_', groups: groupsHtml })
write('posts/index.html', wrap(listHtml, `Posts - ${config.title}`, 'All posts', 'website', 'nav_posts', '/posts/'))

// ── Write tags pages ────────────────────────────────
const tagMap: Record<string, Post[]> = {}
for (const p of posts) {
  for (const t of p.tags) {
    const key = slugify(t)
    if (!tagMap[key]) tagMap[key] = []
    tagMap[key].push(p)
  }
}

// Tag index
let tagCloudHtml = '<div class="tag-cloud">'
for (const [slug, tagPosts] of Object.entries(tagMap).sort((a, b) => b[1].length - a[1].length)) {
  const label = tagPosts[0].tags.find(t => slugify(t) === slug) || slug
  tagCloudHtml += `<a href="/tags/${slug}/" class="tag">${label} (${tagPosts.length})</a>`
}
tagCloudHtml += '</div>'

const tagsPageHtml = fill(T.list, { section_title: 'Tags_', groups: tagCloudHtml })
write('tags/index.html', wrap(tagsPageHtml, `Tags - ${config.title}`, 'All tags', 'website', 'nav_tags', '/tags/'))

// Individual tag pages
for (const [slug, tagPosts] of Object.entries(tagMap)) {
  const label = tagPosts[0].tags.find(t => slugify(t) === slug) || slug
  const items = tagPosts.map(p =>
    `<a href="/posts/${p.slug}/" class="post-item">
      <span class="post-date">${p.date}</span>
      <span class="post-title-link">${p.title}</span>
    </a>`
  ).join('\n')

  const tagListHtml = fill(T.list, {
    section_title: `#${label}_`,
    groups: `<div class="year-group">${items}</div>`,
  })
  write(`tags/${slug}/index.html`, wrap(tagListHtml, `#${label} - ${config.title}`, `Posts tagged "${label}"`, 'website', 'nav_tags', `/tags/${slug}/`))
}

// ── Write about page ────────────────────────────────
if (existsSync('content/about.md')) {
  const raw = readFileSync('content/about.md', 'utf-8')
  const { data: fm, content } = matter(raw)
  const processed = fm.math ? renderLatex(content) : content
  const html = await marked.parse(processed)
  const aboutHtml = fill(T.page, { title: fm.title || 'About_', content: html })
  let aboutPage = wrap(aboutHtml, `About - ${config.title}`, fm.description || '', 'website', 'nav_about', '/about/')
  if (fm.math) aboutPage = aboutPage.replace('</head>', '  <link rel="stylesheet" href="/css/katex.min.css">\n</head>')
  write('about/index.html', aboutPage)
}

// ── Write home page ─────────────────────────────────
const recentPosts = posts.slice(0, 5)
const recentHtml = recentPosts.map(p =>
  `<a href="/posts/${p.slug}/" class="post-item">
    <span class="post-date">${p.date}</span>
    <span class="post-title-link">${p.title}</span>
  </a>`
).join('\n')

const linksHtml = config.links.map(l =>
  `<a href="${l.url}">${l.label}</a>`
).join('')

const homeContent = fill(T.home, {
  subtitle: config.subtitle.replace(/\n/g, '<br>'),
  links: linksHtml,
  recent_posts: recentHtml,
})
write('index.html', wrap(homeContent, config.title, config.subtitle.replace(/\n/g, ' '), 'website', 'nav_home'))

// ── Copy static ─────────────────────────────────────
cpSync('static', DIST, { recursive: true })

// ── SEO: sitemap.xml ────────────────────────────────
const sitemapUrls = [
  { loc: '/', priority: '1.0' },
  { loc: '/posts/', priority: '0.8' },
  { loc: '/tags/', priority: '0.5' },
  { loc: '/about/', priority: '0.6' },
  ...posts.map(p => ({ loc: `/posts/${p.slug}/`, priority: '0.7' })),
  ...Object.keys(tagMap).map(t => ({ loc: `/tags/${t}/`, priority: '0.3' })),
]

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(u => `  <url>
    <loc>${config.url}${u.loc}</loc>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`
write('sitemap.xml', sitemap)

// ── SEO: robots.txt ─────────────────────────────────
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`)

// ── SEO: RSS feed ───────────────────────────────────
const rssItems = posts.slice(0, 20).map(p => `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${config.url}/posts/${p.slug}/</link>
      <guid>${config.url}/posts/${p.slug}/</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${escapeHtml(p.description)}</description>
    </item>`).join('\n')

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${config.title}</title>
    <link>${config.url}</link>
    <description>${escapeHtml(config.subtitle.replace(/\n/g, ' '))}</description>
    <language>en</language>
    <atom:link href="${config.url}/feed.xml" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>`
write('feed.xml', rss)

// ── Done ────────────────────────────────────────────
console.log(`\n  Built ${posts.length} posts, ${Object.keys(tagMap).length} tags in ${Math.round(performance.now())}ms\n`)

// ── Helpers ─────────────────────────────────────────
function fill(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => data[k] ?? '')
}

function wrap(content: string, title: string, description: string, ogType: string, activeNav: string, urlPath: string = '/'): string {
  const navs: Record<string, string> = { nav_home: '', nav_posts: '', nav_tags: '', nav_about: '' }
  navs[activeNav] = 'class="active"'
  return fill(T.base, {
    title,
    description: escapeHtml(description),
    og_type: ogType,
    canonical: config.url + urlPath,
    content,
    year: String(config.year),
    ...navs,
  })
}

function write(relPath: string, content: string) {
  const full = path.join(DIST, relPath)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
}

function formatDate(d: any): string {
  if (!d) return '1970-01-01'
  const date = new Date(d)
  return date.toISOString().slice(0, 10)
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function groupBy<T>(arr: T[], fn: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) {
    const key = fn(item)
    if (!out[key]) out[key] = []
    out[key].push(item)
  }
  return out
}

function renderLatex(md: string): string {
  // Skip code blocks, then render $$ blocks, then $ inline
  const codeBlocks: string[] = []
  let s = md.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m)
    return `%%CODEBLOCK${codeBlocks.length - 1}%%`
  })
  // Block: $$...$$
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false }) }
    catch { return `<pre>${tex}</pre>` }
  })
  // Inline: $...$  (but not $$)
  s = s.replace(/(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)/g, (_, tex) => {
    try { return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false }) }
    catch { return `<code>${tex}</code>` }
  })
  // Restore code blocks
  s = s.replace(/%%CODEBLOCK(\d+)%%/g, (_, i) => codeBlocks[Number(i)])
  return s
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function findMdFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const results: string[] = []
  const entries = require('fs').readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) results.push(...findMdFiles(full))
    else if (e.name.endsWith('.md')) results.push(full)
  }
  return results
}
