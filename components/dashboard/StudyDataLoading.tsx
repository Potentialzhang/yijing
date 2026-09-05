"use client";

export function StudyDataLoading({ label = "正在读取本地学习记录…" }: { label?: string } = {}) {
  return (
    <div className="study-data-loading" role="status" aria-live="polite">
      {label}
    </div>
  );
}
