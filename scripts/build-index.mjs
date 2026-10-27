import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'deck/src')

function loadAuthors() {
  const content = readFileSync(join(src, 'authors/authors.yml'), 'utf8')
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const authors = {}
  let current = null
  for (const line of match[1].split('\n')) {
    const nickLine = line.match(/^\s+-\s+nick:\s*(.+)/)
    if (nickLine) {
      current = { nick: nickLine[1].trim() }
      authors[current.nick] = current
      continue
    }
    if (!current) continue
    const kv = line.match(/^\s+(name|title|photo):\s*(.+)/)
    if (kv) current[kv[1]] = kv[2].trim()
  }
  return authors
}

function loadIntro() {
  const content = readFileSync(join(src, 'showcase/intro.yml'), 'utf8')
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const intro = {}
  let currentKey = null
  let multiline = []
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*\|?\s*$/)
    if (kv) {
      if (currentKey) intro[currentKey] = multiline.join('\n').trim()
      currentKey = kv[1]
      multiline = []
      continue
    }
    const simple = line.match(/^(\w+):\s*(.+)$/)
    if (simple) {
      if (currentKey) { intro[currentKey] = multiline.join('\n').trim(); currentKey = null }
      intro[simple[1]] = simple[2].trim()
      continue
    }
    if (currentKey) multiline.push(line.replace(/^ {2}/, ''))
  }
  if (currentKey) intro[currentKey] = multiline.join('\n').trim()
  return intro
}

function parseEpisode(content) {
  const ep = { sessions: [] }
  for (const line of content.trim().split('\n')) {
    const session = line.match(/^(light|regular):\s*(\w+)\s*\|\s*(.+)$/)
    if (session) {
      ep.sessions.push({ type: session[1], nick: session[2], talk: session[3].trim() })
      continue
    }
    const m = line.match(/^(\w+):\s*(.+)$/)
    if (m) ep[m[1]] = m[2].trim()
  }
  return ep
}

function loadAllEpisodes() {
  const episodesDir = join(src, 'episodes')
  if (!existsSync(episodesDir)) return []
  return readdirSync(episodesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name))
    .map(d => {
      const file = join(episodesDir, d.name, 'index.md')
      if (!existsSync(file)) return null
      const content = readFileSync(file, 'utf8')
      const fenceMatch = content.match(/```episode\n([\s\S]*?)```/)
      if (!fenceMatch) return null
      const ep = parseEpisode(fenceMatch[1])
      ep.dir = d.name
      return ep
    })
    .filter(Boolean)
}

function mdLinks(text) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderPage(episodes, authors, intro) {
  const episodeCards = episodes.map(ep => {
    const sessionHtml = ep.sessions.map(s => {
      const author = authors[s.nick]
      if (!author) return ''
      const isLight = s.type === 'light'
      const typeClass = isLight ? 'light' : 'regular'
      const label = isLight ? 'Lightning Talk' : 'Session'
      return `
            <div class="session ${typeClass}">
              <img class="avatar" src="./authors/img/${author.photo}" alt="${escHtml(author.name)}" />
              <div class="session-info">
                <span class="session-type">${label}</span>
                <h3 class="talk-title">${escHtml(s.talk)}</h3>
                <p class="speaker-name">${escHtml(author.name)}</p>
                <p class="speaker-title">${escHtml(author.title)}</p>
              </div>
            </div>`
    }).join('\n')

    const videoHtml = ep.youtube
      ? `
            <div class="video-wrapper">
              <iframe src="https://www.youtube.com/embed/${escHtml(ep.youtube)}" title="Episode ${ep.number}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>`
      : ''

    return `
          <div class="episode-card">
            <div class="episode-header">
              <div class="episode-number">
                <span class="ep-hash">#</span>${ep.number}
              </div>
              <div class="episode-meta">
                <h2 class="episode-heading">Episode ${ep.number}</h2>
                <time class="episode-date">${escHtml(ep.date)}</time>
              </div>
              <a href="./episodes/${ep.dir}/" class="slides-link" title="View slides">
                <svg viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                Slides
              </a>
            </div>${videoHtml}
            <div class="sessions">
${sessionHtml}
            </div>
          </div>`
  }).join('\n')

  const introText = intro.text
    ? intro.text.split('\n\n').map(p => `<p>${mdLinks(p.trim())}</p>`).join('\n          ')
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Debezium Community Showcase</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --dbz-bg: #090F1B;
      --dbz-bg-alt: #060B15;
      --dbz-bg-deep: #040810;
      --dbz-surface: #0F1927;
      --dbz-surface-2: #182735;
      --dbz-border: #273F4C;
      --dbz-border-strong: #3A5B66;
      --dbz-text: #E8ECEF;
      --dbz-muted: #A4B5C1;
      --dbz-brand: #91D443;
      --dbz-brand-strong: #AAE069;
      --dbz-accent: #48BFE0;
      --dbz-accent-strong: #6FD3EC;
      --dbz-warn: #F0A828;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: var(--dbz-bg);
      color: var(--dbz-text);
      font-family: 'Inter', system-ui, sans-serif;
      line-height: 1.5;
      min-height: 100vh;
    }

    .bg-glow {
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background:
        radial-gradient(ellipse at 80% 0%, rgba(72, 191, 224, 0.08), transparent 50%),
        radial-gradient(ellipse at 20% 100%, rgba(145, 212, 67, 0.06), transparent 50%);
    }

    .container {
      position: relative;
      z-index: 1;
      max-width: 820px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Header */
    header {
      padding: 48px 0 0;
      text-align: center;
    }

    .logo {
      width: 200px;
      height: auto;
      margin-bottom: 32px;
      opacity: 0.95;
    }

    header h1 {
      font-size: 42px;
      font-weight: 800;
      letter-spacing: -0.02em;
      line-height: 1.1;
      margin-bottom: 8px;
    }

    header h1 .brand {
      background: linear-gradient(90deg, var(--dbz-brand), var(--dbz-accent));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .subtitle {
      color: var(--dbz-muted);
      font-size: 18px;
      font-weight: 400;
    }

    /* Intro */
    .intro {
      margin: 40px 0;
      padding: 28px 32px;
      background: var(--dbz-surface);
      border: 1px solid var(--dbz-border);
      border-radius: 16px;
      display: flex;
      gap: 32px;
      align-items: center;
    }

    .intro-text {
      flex: 1;
    }

    .intro-text p {
      color: var(--dbz-muted);
      font-size: 15px;
      margin-bottom: 10px;
    }

    .intro-text p:last-child { margin-bottom: 0; }

    .intro-text a {
      color: var(--dbz-accent-strong);
      text-decoration: none;
      font-weight: 500;
    }

    .intro-text a:hover {
      text-decoration: underline;
    }

    .intro-image {
      flex-shrink: 0;
      width: 140px;
    }

    .intro-image img {
      width: 100%;
      height: auto;
    }

    /* Episodes */
    .episodes-header {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 20px;
    }

    .episodes-header h2 {
      font-size: 24px;
      font-weight: 700;
    }

    .episodes-header .count {
      color: var(--dbz-muted);
      font-size: 14px;
      font-weight: 500;
    }

    .episode-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-bottom: 64px;
    }

    .episode-card {
      background: var(--dbz-surface);
      border: 1px solid var(--dbz-border);
      border-radius: 16px;
      padding: 24px 28px;
    }

    .episode-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }

    .episode-number {
      width: 56px;
      height: 56px;
      border-radius: 14px;
      background: linear-gradient(135deg, var(--dbz-brand), var(--dbz-accent));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: 800;
      color: var(--dbz-bg-deep);
      flex-shrink: 0;
    }

    .ep-hash {
      font-size: 14px;
      opacity: 0.6;
      margin-right: 1px;
    }

    .episode-meta {
      flex: 1;
    }

    .episode-heading {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 2px;
    }

    .episode-date {
      color: var(--dbz-muted);
      font-size: 14px;
    }

    .slides-link {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--dbz-muted);
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid var(--dbz-border);
      background: var(--dbz-surface-2);
      transition: color 0.2s, border-color 0.2s;
      flex-shrink: 0;
    }

    .slides-link svg {
      width: 18px;
      height: 18px;
    }

    .slides-link:hover {
      color: var(--dbz-brand);
      border-color: var(--dbz-brand);
    }

    .video-wrapper {
      position: relative;
      width: 100%;
      padding-bottom: 56.25%;
      margin-bottom: 16px;
      border-radius: 12px;
      overflow: hidden;
      background: var(--dbz-bg-deep);
    }

    .video-wrapper iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .sessions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .session {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 16px;
      background: var(--dbz-surface-2);
      border-radius: 12px;
      border-left: 3px solid transparent;
    }

    .session.light {
      border-left-color: var(--dbz-accent);
    }

    .session.regular {
      border-left-color: var(--dbz-brand);
    }

    .avatar {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }

    .session.light .avatar {
      border: 2px solid var(--dbz-accent);
    }

    .session.regular .avatar {
      border: 2px solid var(--dbz-brand);
    }

    .session-info {
      min-width: 0;
    }

    .session-type {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 999px;
      margin-bottom: 4px;
    }

    .session.light .session-type {
      background: rgba(72, 191, 224, 0.15);
      color: var(--dbz-accent-strong);
    }

    .session.regular .session-type {
      background: rgba(145, 212, 67, 0.15);
      color: var(--dbz-brand-strong);
    }

    .talk-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--dbz-text);
      margin: 2px 0;
      line-height: 1.3;
    }

    .speaker-name {
      font-size: 13px;
      color: var(--dbz-text);
      font-weight: 500;
    }

    .speaker-title {
      font-size: 12px;
      color: var(--dbz-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Footer */
    footer {
      text-align: center;
      padding: 32px 0;
      color: var(--dbz-muted);
      font-size: 13px;
      border-top: 1px solid var(--dbz-border);
    }

    footer a {
      color: var(--dbz-accent-strong);
      text-decoration: none;
    }

    /* Responsive */
    @media (max-width: 640px) {
      header { padding-top: 32px; }
      header h1 { font-size: 30px; }
      .subtitle { font-size: 15px; }
      .intro { flex-direction: column-reverse; padding: 20px 22px; gap: 20px; }
      .intro-image { width: 100px; }
      .episode-card { padding: 18px 20px; }
      .episode-number { width: 46px; height: 46px; font-size: 18px; }
      .session { flex-direction: column; text-align: center; gap: 8px; padding: 12px; }
      .speaker-title { white-space: normal; }
    }
  </style>
</head>
<body>
  <div class="bg-glow"></div>
  <div class="container">
    <header>
      <img class="logo" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgNjAwIDEzMC45MyI+PGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOiNmZmY7fS5jbHMtMntmaWxsOnVybCgjbGluZWFyLWdyYWRpZW50KTt9LmNscy0ze2ZpbGw6dXJsKCNsaW5lYXItZ3JhZGllbnQtMik7fS5jbHMtNHtmaWxsOnVybCgjbGluZWFyLWdyYWRpZW50LTMpO30uY2xzLTV7ZmlsbDp1cmwoI2xpbmVhci1ncmFkaWVudC00KTt9LmNscy02e2ZpbGw6dXJsKCNsaW5lYXItZ3JhZGllbnQtNSk7fTwvc3R5bGU+PGxpbmVhckdyYWRpZW50IGlkPSJsaW5lYXItZ3JhZGllbnQiIHgxPSIxOS43NCIgeTE9IjE5LjczIiB4Mj0iMTE0LjAzIiB5Mj0iMTE0LjAyIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjOTFkNDQzIi8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNDhiZmUwIi8+PC9saW5lYXJHcmFkaWVudD48bGluZWFyR3JhZGllbnQgaWQ9ImxpbmVhci1ncmFkaWVudC0yIiB4MT0iNDMuMTkiIHkxPSItMy43MiIgeDI9IjEzNy40OCIgeTI9IjkwLjU3IiB4bGluazpocmVmPSIjbGluZWFyLWdyYWRpZW50Ii8+PGxpbmVhckdyYWRpZW50IGlkPSJsaW5lYXItZ3JhZGllbnQtMyIgeDE9IjY2LjU2IiB5MT0iLTI3LjA5IiB4Mj0iMTYwLjg1IiB5Mj0iNjcuMiIgeGxpbms6aHJlZj0iI2xpbmVhci1ncmFkaWVudCIvPjxsaW5lYXJHcmFkaWVudCBpZD0ibGluZWFyLWdyYWRpZW50LTQiIHgxPSItMy43MiIgeTE9IjQzLjE4IiB4Mj0iOTAuNTciIHkyPSIxMzcuNDciIHhsaW5rOmhyZWY9IiNsaW5lYXItZ3JhZGllbnQiLz48bGluZWFyR3JhZGllbnQgaWQ9ImxpbmVhci1ncmFkaWVudC01IiB4MT0iLTI3LjA5IiB5MT0iNjYuNTUiIHgyPSI2Ny4yIiB5Mj0iMTYwLjg0IiB4bGluazpocmVmPSIjbGluZWFyLWdyYWRpZW50Ii8+PC9kZWZzPjx0aXRsZT5jb2xvcl93aGl0ZTwvdGl0bGU+PGcgaWQ9IkxheWVyXzEiIGRhdGEtbmFtZT0iTGF5ZXIgMSI+PHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTc0LjU2LDkyLjM5UTE2OCw4NS43NCwxNjgsNzQuODd0Ni43NC0xNy4zNEEyMi40LDIyLjQsMCwwLDEsMTkwLjgxLDUxcTkuMzMsMCwxNSw3Ljg4VjMzLjM2aDkuODF2NjVoLTkuODF2LTdRMjAwLjQsOTkuMDUsMTkwLDk5LjA1QTIxLDIxLDAsMCwxLDE3NC41Niw5Mi4zOVptMy4yNC0xNy4xM2ExNC42LDE0LjYsMCwwLDAsNC4yOSwxMC45MSwxMy45MywxMy45MywwLDAsMCwxMC4wOCw0LjJBMTMsMTMsMCwwLDAsMjAyLDg2LjEzYTE1LjIsMTUuMiwwLDAsMCw0LTEwLjksMTYsMTYsMCwwLDAtNC0xMS4xMywxMi44MiwxMi44MiwwLDAsMC05LjktNC40N0ExMy4zNSwxMy4zNSwwLDAsMCwxODIsNjQuMSwxNS42NiwxNS42NiwwLDAsMCwxNzcuOCw3NS4yN1oiLz48cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0yNzMuMTksNzkuMzRIMjM2LjY2YTEwLjYxLDEwLjYxLDAsMCwwLDQuNjQsOC4xOSwxNi4yOSwxNi4yOSwwLDAsMCw5LjgxLDMuMTFxOC43NSwwLDEzLjMxLTUuNTJMMjcwLDkxLjI2cS03LjUzLDcuOC0xOS42Miw3LjhhMjMuMzUsMjMuMzUsMCwwLDEtMTYuNjktNi41M1EyMjYuODUsODYsMjI2Ljg1LDc1dDctMTcuNDhBMjMuNTIsMjMuNTIsMCwwLDEsMjUwLjM3LDUxYTIzLjkyLDIzLjkyLDAsMCwxLDE2LjE2LDUuNzRxNi42NSw1Ljc0LDYuNjYsMTUuODFabS0zNi41My03LjcxaDI2LjcycTAtNS44Ny0zLjY4LTlhMTMuNDYsMTMuNDYsMCwwLDAtOS4wNy0zLjE1QTE1LjUyLDE1LjUyLDAsMCwwLDI0MSw2Mi43NCwxMC42LDEwLjYsMCwwLDAsMjM2LjY2LDcxLjYzWiIvPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTMwOC45Myw1MWEyMi4xNiwyMi4xNiwwLDAsMSwxNiw2LjQ4cTYuNjUsNi40OCw2LjY2LDE3LjI2VDMyNSw5Mi4zMWEyMC45MywyMC45MywwLDAsMS0xNS40Miw2Ljc1cS04LjgsMC0xNS44MS03LjcxdjdIMjg0di02NWg5LjgxVjU5LjlRMjk5LjU2LDUxLjA1LDMwOC45Myw1MVpNMjkzLjYsNzUuMTRhMTUuMjEsMTUuMjEsMCwwLDAsNCwxMC45MSwxMywxMywwLDAsMCw5LjgxLDQuMjUsMTMuOTMsMTMuOTMsMCwwLDAsMTAuMDctNC4yMSwxNC41OSwxNC41OSwwLDAsMCw0LjI5LTEwLjkxLDE1LjUxLDE1LjUxLDAsMCwwLTQuMi0xMS4xMiwxMy40MiwxMy40MiwwLDAsMC0xMC4wOC00LjQyLDEyLjg3LDEyLjg3LDAsMCwwLTkuOSw0LjQyQTE1Ljg0LDE1Ljg0LDAsMCwwLDI5My42LDc1LjE0WiIvPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTM4Ni4xOSw3OS4zNEgzNDkuNjZhMTAuNjEsMTAuNjEsMCwwLDAsNC42NCw4LjE5LDE2LjI5LDE2LjI5LDAsMCwwLDkuODEsMy4xMXE4Ljc2LDAsMTMuMzItNS41Mmw1LjYsNi4xM3EtNy41Myw3LjgtMTkuNjIsNy44YTIzLjM1LDIzLjM1LDAsMCwxLTE2LjY5LTYuNTNRMzM5Ljg1LDg2LDMzOS44NSw3NXQ3LTE3LjQ4QTIzLjUyLDIzLjUyLDAsMCwxLDM2My4zNyw1MWEyMy45MiwyMy45MiwwLDAsMSwxNi4xNiw1Ljc0cTYuNjYsNS43NCw2LjY2LDE1LjgxWm0tMzYuNTMtNy43MWgyNi43MnEwLTUuODctMy42OC05YTEzLjQ1LDEzLjQ1LDAsMCwwLTkuMDctMy4xNUExNS41MSwxNS41MSwwLDAsMCwzNTQsNjIuNzQsMTAuNiwxMC42LDAsMCwwLDM0OS42Niw3MS42M1oiLz48cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0zOTUuNDgsNjAuMzNWNTEuOTNoMzYuNDR2OC44NUw0MDUuNzIsODkuODVoMjcuNTl2OC41SDM5My43MlY4OC44bDI1LjQ5LTI4LjQ3WiIvPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTQ0NSw0Mi40N2E2LjE0LDYuMTQsMCwxLDEsNC4zOCwxLjg0QTYsNiwwLDAsMSw0NDUsNDIuNDdabTkuMiw1NS44OWgtOS44MVY1MS43NWg5LjgxWiIvPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTUwMC45NCw3N1Y1MS43NWg5LjgxdjQ2LjZoLTkuODF2LTguNWExNy42NywxNy42NywwLDAsMS0xNS41LDkuMnEtNy44OCwwLTEyLjc1LTQuODJ0LTQuODYtMTMuOTNWNTEuNzVoOS44MVY3Ny4zM3EwLDEyLjg3LDEwLjY5LDEyLjg4YTEyLjgzLDEyLjgzLDAsMCwwLDguODUtMy4zN1E1MDAuOTQsODMuNDYsNTAwLjk0LDc3WiIvPjxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTUzNC43NSw3My4xMlY5OC4zNWgtOS44MVY1MS43NWg5LjgxdjguNWExNS41NSwxNS41NSwwLDAsMSw2LjM1LTYuNzRBMTgsMTgsMCwwLDEsNTUwLjI1LDUxcTExLDAsMTUsOS4xMSw2LjkyLTkuMTEsMTcuMjYtOS4xMSw3Ljg4LDAsMTIuNzUsNC44MnQ0Ljg2LDEzLjkzVjk4LjM1aC05LjgxVjcyLjc3cTAtMTIuODgtMTAuNjktMTIuODhhMTMsMTMsMCwwLDAtOC43MiwzLjJxLTMuNzIsMy4yLTMuOSw5LjMzVjk4LjM1aC05LjgxVjcyLjc3cTAtNi42Ni0yLjM2LTkuNzd0LTcuNDUtMy4xMWExMi44NCwxMi44NCwwLDAsMC04Ljg1LDMuMzdRNTM0Ljc1LDY2LjY0LDUzNC43NSw3My4xMloiLz48cGF0aCBjbGFzcz0iY2xzLTIiIGQ9Ik05My43OSwxMTQuMjlhMTYuNjUsMTYuNjUsMCwwLDAsMTYuNjMsMTYuNjNoMjAuNTNWMTEwLjM5YTE2LjY1LDE2LjY1LDAsMCwwLTE2LjYzLTE2LjYzaC0zLjkxQTI2LjM5LDI2LjM5LDAsMCwxLDg0LDY3LjRWNjMuNTFBMTYuNjUsMTYuNjUsMCwwLDAsNjcuNDEsNDYuODloLTMuOUEyNi4zOSwyNi4zOSwwLDAsMSwzNy4xNiwyMC41MmgwVjE2LjYyQTE2LjY1LDE2LjY1LDAsMCwwLDIwLjUzLDBIMFYyMC41MkExNi42NSwxNi42NSwwLDAsMCwxNi42MywzNy4xNWgzLjkxQTI2LjM5LDI2LjM5LDAsMCwxLDQ2LjksNjMuNTFWNjcuNEExNi42NSwxNi42NSwwLDAsMCw2My41Myw4NGgzLjlhMjYuMzksMjYuMzksMCwwLDEsMjYuMzYsMjYuMzZoMFoiLz48cGF0aCBjbGFzcz0iY2xzLTMiIGQ9Ik0xMzAuOTQsNjMuNTFhMTYuNjUsMTYuNjUsMCwwLDAtMTYuNjMtMTYuNjNoLTMuOTFBMjYuMzksMjYuMzksMCwwLDEsODQsMjAuNTJWMTYuNjJBMTYuNjUsMTYuNjUsMCwwLDAsNjcuNDEsMEg0Ni45VjIwLjc1QTE2LjY0LDE2LjY0LDAsMCwwLDYzLjUyLDM3LjE1aDMuOTFBMjYuMzksMjYuMzksMCwwLDEsOTMuNzksNjMuNTFoMFY2Ny40QTE2LjY1LDE2LjY1LDAsMCwwLDExMC4zNiw4NGgyMC41OFoiLz48cGF0aCBjbGFzcz0iY2xzLTQiIGQ9Ik0xMzAuOTQsMTYuNDlBMTYuNjMsMTYuNjMsMCwwLDAsMTE1LDBIOTMuNDdWMjAuN2ExNi42NCwxNi42NCwwLDAsMCwxNi42MiwxNi40NGgyMC44NVoiLz48cGF0aCBjbGFzcz0iY2xzLTUiIGQ9Ik0wLDY3LjQ0QTE2LjY1LDE2LjY1LDAsMCwwLDE2LjY0LDg0LjA2aDMuOTFhMjYuMzksMjYuMzksMCwwLDEsMjYuMzYsMjYuMzZ2My44OWExNi42NSwxNi42NSwwLDAsMCwxNi42MywxNi42M0g4NFYxMTAuMTlBMTYuNjQsMTYuNjQsMCwwLDAsNjcuNDMsOTMuOEg2My41M0EyNi4zOSwyNi4zOSwwLDAsMSwzNy4xNiw2Ny40NGgwVjYzLjU0QTE2LjY1LDE2LjY1LDAsMCwwLDIwLjU5LDQ2LjkxSDBaIi8+PHBhdGggY2xhc3M9ImNscy02IiBkPSJNMCwxMTQuNDVhMTYuNjMsMTYuNjMsMCwwLDAsMTYsMTYuNUgzNy40OFYxMTAuMjRBMTYuNjQsMTYuNjQsMCwwLDAsMjAuODYsOTMuOEgwWiIvPjwvZz48L3N2Zz4=" alt="Debezium" />
      <h1>Community <span class="brand">Showcase</span></h1>
      <p class="subtitle">Talks, demos, and deep dives from the Debezium community</p>
    </header>

    <section class="intro">
      <div class="intro-text">
        ${introText}
      </div>
      <div class="intro-image">
        <img src="./showcase/showcase.svg" alt="Showcase" />
      </div>
    </section>

    <div class="episodes-header">
      <h2>Episodes</h2>
      <span class="count">${episodes.length} episode${episodes.length !== 1 ? 's' : ''}</span>
    </div>

    <div class="episode-list">
${episodeCards}
    </div>

    <footer>
      Debezium Community Showcase &middot; <a href="https://debezium.io">debezium.io</a>
    </footer>
  </div>
</body>
</html>
`
}

const authors = loadAuthors()
const intro = loadIntro()
const episodes = loadAllEpisodes()

mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(join(root, 'public/index.html'), renderPage(episodes, authors, intro))
console.log(`Built index.html with ${episodes.length} episode(s)`)
