import { isValidIsoTimestamp } from "@/core/date/local";

export type AiServiceFailure =
  | "offline"
  | "timeout"
  | "unauthorized"
  | "provider-unavailable"
  | "payload-too-large"
  | "serialization-failed"
  | "unknown";

export type AiFallbackAction =
  "continue-local" | "retry-later" | "revoke-consent" | "ask-user";

export interface AiServiceNotice {
  failure: AiServiceFailure;
  action: AiFallbackAction;
  title: string;
  message: string;
}

export interface AiRemoteDeletionRequest {
  contractVersion: 1;
  remoteRecordIds: string[];
  requestedAt: string;
  userConfirmed: true;
}

export function buildAiFallbackNotice(
  failure: AiServiceFailure,
): AiServiceNotice {
  switch (failure) {
    case "offline":
      return {
        failure,
        action: "continue-local",
        title: "当前处于离线状态",
        message: "AI 请求不会重试或排队；学习、复习、笔记和本地工具继续可用。",
      };
    case "timeout":
      return {
        failure,
        action: "retry-later",
        title: "AI 服务响应超时",
        message: "草稿未提交；请稍后重试，原笔记和学习记录不会被修改。",
      };
    case "unauthorized":
      return {
        failure,
        action: "revoke-consent",
        title: "AI 授权已失效",
        message: "停止后续请求并撤销本地授权，其他学习功能不受影响。",
      };
    case "provider-unavailable":
      return {
        failure,
        action: "retry-later",
        title: "AI 服务暂不可用",
        message:
          "不生成伪造结果；保留本地学习流程，待服务恢复后由用户重新发起。",
      };
    case "payload-too-large":
      return {
        failure,
        action: "ask-user",
        title: "选中的内容超过发送上限",
        message:
          "请缩小本次选择范围后重新生成预览；原笔记和学习记录不会被修改。",
      };
    case "serialization-failed":
      return {
        failure,
        action: "ask-user",
        title: "选中的内容无法安全编码",
        message:
          "本次请求已取消，请检查选中内容后重试；不会把无法确认的数据交给 AI 服务。",
      };
    default:
      return {
        failure: "unknown",
        action: "ask-user",
        title: "AI 请求未完成",
        message: "请求状态不明，默认不重试、不保存输出，请由用户决定下一步。",
      };
  }
}

export function buildAiRemoteDeletionRequest(
  remoteRecordIds: readonly string[],
  userConfirmed: boolean,
  requestedAt = new Date().toISOString(),
): AiRemoteDeletionRequest {
  if (userConfirmed !== true) throw new Error("删除远端 AI 记录必须经过用户确认");
  if (typeof requestedAt !== "string" || !isValidIsoTimestamp(requestedAt))
    throw new TypeError("删除远端 AI 记录的请求时间无效");
  if (!Array.isArray(remoteRecordIds))
    throw new TypeError("远端 AI 记录 ID 必须是数组");
  const ids = [
    ...new Set(
      remoteRecordIds.map((id) => {
        if (typeof id !== "string") throw new TypeError("远端 AI 记录 ID 必须是字符串");
        return id.trim();
      }).filter(Boolean),
    ),
  ];
  if (ids.length === 0) throw new Error("没有可删除的远端 AI 记录");
  return {
    contractVersion: 1,
    remoteRecordIds: ids,
    requestedAt,
    userConfirmed: true,
  };
}
