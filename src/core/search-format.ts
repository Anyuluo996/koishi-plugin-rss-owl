import { SearchResponse } from './search-types'

export function formatSearchResults(response: SearchResponse): string {
  if (!response.success || response.results.length === 0) {
    return ''
  }

  const lines: string[] = []
  lines.push(`\n联网搜索结果 (${response.engine}):\n`)

  response.results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title}`)
    lines.push(`   链接: ${result.url}`)
    if (result.snippet) {
      lines.push(`   摘要: ${result.snippet}`)
    }
    if (result.publishedDate) {
      lines.push(`   发布时间: ${result.publishedDate}`)
    }
    lines.push('')
  })

  return lines.join('\n')
}

export function buildPromptWithSearchContext(
  originalPrompt: string,
  searchResults: SearchResponse,
  _searchQuery: string
): string {
  if (!searchResults.success || searchResults.results.length === 0) {
    return originalPrompt
  }

  const formattedResults = formatSearchResults(searchResults)
  return `${originalPrompt}

${formattedResults}

【搜索结果使用原则】：
1. 若 RSS 原始内容残缺，请使用以上搜索结果进行补全。
2. 搜索结果仅作为背景参考，若搜索结果中的人物、时间、事件与 RSS 原文冲突，**必须以 RSS 原文为准**！请提取并生成一份事实准确、语言简洁流畅的摘要。`
}