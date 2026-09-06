"use client";

export function StudyDataError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="study-data-error" role="alert">
      <strong>账户学习数据暂时无法读取</strong>
      <span>请检查网络和账户会话后重试；数据库中的记录不会因本次读取失败而被删除。</span>
      <button type="button" className="outline-button" onClick={onRetry}>
        重新读取
      </button>
    </div>
  );
}
