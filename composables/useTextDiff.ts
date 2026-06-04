export type DiffRowType = 'same' | 'removed' | 'added'

export interface DiffRow {
  type: DiffRowType
  left: string
  right: string
  leftIndex: number | null
  rightIndex: number | null
}

function lcs(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp
}

function buildDiffRows(dp: number[][], a: string[], b: string[]): DiffRow[] {
  const rows: DiffRow[] = []
  let i = a.length
  let j = b.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      rows.push({ type: 'same', left: a[i - 1], right: b[j - 1], leftIndex: i - 1, rightIndex: j - 1 })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rows.push({ type: 'added', left: '', right: b[j - 1], leftIndex: null, rightIndex: j - 1 })
      j--
    } else {
      rows.push({ type: 'removed', left: a[i - 1], right: '', leftIndex: i - 1, rightIndex: null })
      i--
    }
  }
  return rows.reverse()
}

export function computeParaDiff(textA: string, textB: string): DiffRow[] {
  const parasA = textA.split(/\n+/).filter(p => p.trim())
  const parasB = textB.split(/\n+/).filter(p => p.trim())
  const dp = lcs(parasA, parasB)
  return buildDiffRows(dp, parasA, parasB)
}

export function diffStats(rows: DiffRow[]) {
  let added = 0, removed = 0, same = 0
  for (const r of rows) {
    if (r.type === 'added') added++
    else if (r.type === 'removed') removed++
    else same++
  }
  return { added, removed, same }
}
