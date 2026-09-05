export function buildExportCompletionStatus(
  notes: number,
  reviewAttempts: number,
  metadataSaved: boolean,
): string {
  const base = `已导出 ${notes} 条笔记和 ${reviewAttempts} 条作答记录。`;
  return metadataSaved
    ? base
    : `${base}但上次备份时间未能记录，请检查浏览器存储权限后重试。`;
}
