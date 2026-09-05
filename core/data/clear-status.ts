export function buildClearDataStatus(
  hadSourceTemplate: boolean,
  sourceTemplateCleared: boolean,
): string {
  if (hadSourceTemplate && !sourceTemplateCleared) {
    return "数据库已清空，但来源模板未能移除，请检查浏览器存储权限后重试。";
  }

  return hadSourceTemplate
    ? "已清空本地学习数据（含来源模板）。建议重新导入备份或从一个知识点开始。"
    : "已清空本地学习数据。建议重新导入备份或从一个知识点开始。";
}
