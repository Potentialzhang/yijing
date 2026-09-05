import { tryPostDataChanged } from "@/core/browser/change-events";

export const DATA_CHANGED_EVENT = "yijing:data-changed";
const DATA_CHANGED_STORAGE_KEY = "yijing:data-changed-at";
const DATA_CHANGED_CHANNEL = "yijing:data-changed";

let dataChannel: BroadcastChannel | null = null;

function dispatchDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key !== DATA_CHANGED_STORAGE_KEY || event.newValue === null) return;
  dispatchDataChanged();
}

// IndexedDB 数据可以被多个标签页同时修改；storage 事件只会发送到其他
// 标签页，因此不会在当前页面形成递归通知，也不携带任何用户数据。部分
// WebKit 场景对 storage 事件投递不稳定，再用 BroadcastChannel 做同源通道。
if (typeof window !== "undefined") {
  window.addEventListener("storage", handleStorageChange);
  try {
    if (typeof BroadcastChannel !== "undefined") {
      dataChannel = new BroadcastChannel(DATA_CHANGED_CHANNEL);
      dataChannel.addEventListener("message", dispatchDataChanged);
    }
  } catch {
    dataChannel = null;
  }
}

export function notifyDataChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  const channel = dataChannel;
  if (channel && !tryPostDataChanged(channel, Date.now())) {
    // A closed channel must not make an already-committed IndexedDB write
    // look like a failure. Keep the channel disabled and continue with the
    // storage-event fallback below.
    try { channel.close(); } catch { /* channel was already closed */ }
    dataChannel = null;
  }
  try {
    window.localStorage.setItem(
      DATA_CHANGED_STORAGE_KEY,
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
  } catch {
    // localStorage 可能被禁用；当前页面的自定义事件仍然有效。
  }
}
