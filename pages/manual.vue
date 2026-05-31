<script setup lang="ts">
definePageMeta({ layout: 'default', auth: false })

const { data: rawMd, error } = await useFetch<string>('/manual.md', { responseType: 'text' })

// ── Table of contents ────────────────────────────────────────────────────────
interface Heading { level: number; text: string; id: string }

function headingId(text: string) {
  return text.toLowerCase().replace(/[^\w一-鿿]+/g, '-').replace(/^-+|-+$/g, '')
}

const headings = computed<Heading[]>(() => {
  if (!rawMd.value) return []
  return rawMd.value.split('\n').flatMap(line => {
    const m = line.match(/^(#{1,2})\s+(.+)/)   // 只取 h1/h2，不展开 h3
    if (!m) return []
    return [{ level: m[1].length, text: m[2].replace(/`/g, ''), id: headingId(m[2]) }]
  })
})

// ── Markdown renderer ────────────────────────────────────────────────────────
function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(s: string) {
  return esc(s)
    // code
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-gray-800 text-purple-300 text-[0.85em] font-mono border border-gray-700">$1</code>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-200 font-semibold">$1</strong>')
    // link
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-purple-400 hover:text-purple-300 underline underline-offset-2" target="_blank" rel="noopener">$1</a>')
}

function renderMd(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // ── fenced code block ──────────────────────────────────────────────────
    if (line.startsWith('```')) {
      const lang = esc(line.slice(3).trim())
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(esc(lines[i]))
        i++
      }
      out.push(
        `<div class="my-5 rounded-xl overflow-hidden border border-gray-700 bg-gray-900">` +
        (lang ? `<div class="px-4 py-1.5 text-xs font-mono text-gray-500 bg-gray-800 border-b border-gray-700">${lang}</div>` : '') +
        `<pre class="p-4 overflow-x-auto text-sm font-mono leading-relaxed text-gray-300"><code>${code.join('\n')}</code></pre></div>`
      )
      i++ // skip closing ```
      continue
    }

    // ── headings ──────────────────────────────────────────────────────────
    const hm = line.match(/^(#{1,4})\s+(.+)/)
    if (hm) {
      const lvl = hm[1].length
      const text = hm[2]
      const id = headingId(text)
      if (lvl === 1) {
        out.push(`<h1 id="${id}" class="mt-2 mb-4 text-3xl font-bold text-white border-b border-gray-700 pb-4 scroll-mt-20">${inline(text)}</h1>`)
      } else if (lvl === 2) {
        out.push(`<h2 id="${id}" class="mt-12 mb-4 text-2xl font-bold text-white border-b border-gray-800 pb-3 scroll-mt-20">${inline(text)}</h2>`)
      } else if (lvl === 3) {
        out.push(`<h3 id="${id}" class="mt-8 mb-3 text-lg font-semibold text-purple-300 scroll-mt-20">${inline(text)}</h3>`)
      } else {
        out.push(`<h4 id="${id}" class="mt-6 mb-2 text-base font-semibold text-gray-300 scroll-mt-20">${inline(text)}</h4>`)
      }
      i++
      continue
    }

    // ── horizontal rule ───────────────────────────────────────────────────
    if (/^---+$/.test(line.trim())) {
      out.push('<hr class="my-8 border-gray-700" />')
      i++
      continue
    }

    // ── table ─────────────────────────────────────────────────────────────
    if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i])
        i++
      }
      if (rows.length < 2) {
        // not a real table, emit as paragraphs
        rows.forEach(r => out.push(`<p class="my-2 text-gray-400">${inline(r)}</p>`))
        continue
      }
      const parseCells = (row: string) =>
        row.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1)

      const headers = parseCells(rows[0])
      // rows[1] is separator line (---)
      const dataRows = rows.slice(2).map(parseCells)

      const thead = headers.map(h =>
        `<th class="px-4 py-2.5 text-left text-sm font-semibold text-gray-200 bg-gray-800 border border-gray-700 whitespace-nowrap">${inline(h)}</th>`
      ).join('')

      const tbody = dataRows.map(cells =>
        `<tr class="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors">${
          cells.map(c =>
            `<td class="px-4 py-2.5 text-sm text-gray-400 border border-gray-800/60 align-top">${inline(c)}</td>`
          ).join('')
        }</tr>`
      ).join('')

      out.push(
        `<div class="my-5 overflow-x-auto rounded-lg border border-gray-700">` +
        `<table class="w-full text-sm border-collapse">` +
        (thead ? `<thead><tr>${thead}</tr></thead>` : '') +
        (tbody ? `<tbody>${tbody}</tbody>` : '') +
        `</table></div>`
      )
      continue
    }

    // ── blockquote ────────────────────────────────────────────────────────
    if (line.startsWith('> ')) {
      const content: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        content.push(lines[i].slice(2))
        i++
      }
      out.push(
        `<blockquote class="my-4 pl-4 border-l-4 border-purple-600/60 text-gray-400 italic bg-purple-900/10 py-2 rounded-r">${
          content.map(c => inline(c)).join('<br>')
        }</blockquote>`
      )
      continue
    }

    // ── unordered list ────────────────────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li class="mb-1 text-gray-400">${inline(lines[i].replace(/^[-*+]\s/, ''))}</li>`)
        i++
      }
      out.push(`<ul class="my-3 ml-5 list-disc space-y-0.5">${items.join('')}</ul>`)
      continue
    }

    // ── ordered list ──────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li class="mb-1 text-gray-400">${inline(lines[i].replace(/^\d+\.\s/, ''))}</li>`)
        i++
      }
      out.push(`<ol class="my-3 ml-5 list-decimal space-y-0.5">${items.join('')}</ol>`)
      continue
    }

    // ── blank line ────────────────────────────────────────────────────────
    if (line.trim() === '') {
      i++
      continue
    }

    // ── paragraph ─────────────────────────────────────────────────────────
    out.push(`<p class="my-2.5 text-gray-400 leading-relaxed">${inline(line)}</p>`)
    i++
  }

  return out.join('\n')
}

const html = computed(() => rawMd.value ? renderMd(rawMd.value) : '')

// ── Active heading tracking ───────────────────────────────────────────────────
const activeId = ref('')
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    entries => {
      const visible = entries.filter(e => e.isIntersecting)
      if (visible.length > 0) {
        activeId.value = visible[0].target.id
      }
    },
    { rootMargin: '-72px 0px -60% 0px' }
  )
  document.querySelectorAll('h1, h2, h3').forEach(el => observer!.observe(el))
})

onUnmounted(() => observer?.disconnect())
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">

    <!-- ── Breadcrumb bar ─────────────────────────────────────────────────── -->
    <div class="sticky top-16 z-10 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/60">
      <div class="max-w-7xl mx-auto px-6 h-10 flex items-center gap-2 text-sm text-gray-500">
        <NuxtLink to="/" class="hover:text-gray-300 transition-colors">首页</NuxtLink>
        <span>/</span>
        <span class="text-gray-300">功能介绍</span>
      </div>
    </div>

    <!-- ── Error state ────────────────────────────────────────────────────── -->
    <div v-if="error" class="max-w-2xl mx-auto px-6 py-20 text-center">
      <p class="text-gray-500 text-lg">手册加载失败，请稍后重试。</p>
      <p class="text-gray-600 text-sm mt-2">{{ error.message }}</p>
    </div>

    <!-- ── Main layout ────────────────────────────────────────────────────── -->
    <div v-else class="max-w-7xl mx-auto px-6 py-10 flex gap-10">

      <!-- Left sidebar: Table of Contents -->
      <aside class="hidden xl:block w-60 flex-shrink-0">
        <div class="sticky top-32">
          <p class="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">目录</p>
          <nav class="overflow-y-auto max-h-[calc(100vh-10rem)] space-y-0.5 pr-1
                       scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-700">
            <template v-for="h in headings" :key="h.id">
              <a
                :href="`#${h.id}`"
                :class="[
                  'block rounded py-1 transition-colors',
                  h.level === 1 ? 'px-2 text-sm font-semibold' :
                  h.level === 2 ? 'px-3 text-sm' :
                                  'px-5 text-xs',
                  activeId === h.id
                    ? 'text-purple-400 bg-purple-900/20'
                    : 'text-gray-600 hover:text-gray-300 hover:bg-gray-800/40'
                ]"
              >{{ h.text }}</a>
            </template>
          </nav>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 min-w-0" v-html="html" />

      <!-- Right gutter (reserved, keeps content centered) -->
      <div class="hidden xl:block w-32 flex-shrink-0" />
    </div>

  </div>
</template>
