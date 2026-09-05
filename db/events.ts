import { tryPostDataChanged } from "@/core/browser/change-events";

export const DATA_CHANGED_EVENT = "yijing:data-changed";
const DATA_CHANGED_CHANNEL = "yijing:data-changed";

let dataChannel: BroadcastChannel | null = null;

function dispatchDataChanged(): void {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

// 数据现在由服务端 PostgreSQL 持久化；跨标签页只发送无数据的刷新信号，
// 不再借助浏览器键值存储作为数据层或同步介质。
if (typeof window !== "undefined") {
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
    // A closed channel must not make an already-committed database write look
    // like a failure. Keep the channel disabled; the current page already
    // received the custom event above.
    try { channel.close(); } catch { /* channel was already closed */ }
    dataChannel = null;
  }
}
