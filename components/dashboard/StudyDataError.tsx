"use client";

export function StudyDataError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="study-data-error" role="alert">
      <strong>本地学习数据暂时无法读取</strong>
      <span>请检查浏览器存储权限后重试；已有记录不会因本次读取失败而被删除。</span>
      <button type="button" className="outline-button" onClick={onRetry}>
        重新读取
      </button>
    </div>
  );
}
