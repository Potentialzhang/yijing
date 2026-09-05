import {
  assertAiRequestPreview,
  type AiRequestPreview,
} from "@/core/ai/consent";
import {
  evaluateAiDraftSafety,
  type AiSafetyReport,
} from "@/core/ai/evaluation";
import { assertAiDraftOutput, type AiDraftOutput } from "@/core/ai/output";
import {
  buildAiFallbackNotice,
  type AiServiceFailure,
  type AiServiceNotice,
} from "@/core/ai/service-policy";

export interface AiProviderRequest {
  preview: AiRequestPreview;
  /** Data has already been filtered to the preview's included fields. */
  selectedData: Readonly<Record<string, unknown>>;
  userConfirmed: true;
}

export interface AiProvider {
  id: string;
  generateDraft(
    request: AiProviderRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface AiProviderRunOptions {
  timeoutMs?: number;
  /** Maximum serialized selected-data size sent to a provider. */
  maxPayloadChars?: number;
}

export const DEFAULT_AI_TIMEOUT_MS = 15_000;
export const MAX_AI_TIMEOUT_MS = 60_000;
export const DEFAULT_AI_PAYLOAD_CHARS = 50_000;
export const MAX_AI_PAYLOAD_CHARS = 100_000;

export type AiProviderRunResult =
  | { status: "success"; draft: AiDraftOutput; safety: AiSafetyReport }
  | { status: "unsafe-output"; safety: AiSafetyReport }
  | { status: "failed"; notice: AiServiceNotice };

export class AiProviderFailure extends Error {
  readonly failure: AiServiceFailure;

  constructor(failure: AiServiceFailure, message: string) {
    super(message);
    this.name = "AiProviderFailure";
    this.failure = failure;
  }
}

function failureFromUnknown(error: unknown): AiServiceFailure {
  if (error instanceof AiProviderFailure) return error.failure;
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  )
    return "timeout";
  return "provider-unavailable";
}

function draftScopesAreAuthorized(
  draft: AiDraftOutput,
  preview: AiRequestPreview,
): boolean {
  const authorizedScopes = new Set(preview.scopes);
  return draft.inputScopes.every((scope) => authorizedScopes.has(scope));
}

function clampPositiveOption(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(maximum, Math.max(1, value));
}

export function normalizeAiProviderTimeoutMs(value?: number): number {
  return clampPositiveOption(value, DEFAULT_AI_TIMEOUT_MS, MAX_AI_TIMEOUT_MS);
}

export function normalizeAiProviderPayloadChars(value?: number): number {
  return clampPositiveOption(
    value,
    DEFAULT_AI_PAYLOAD_CHARS,
    MAX_AI_PAYLOAD_CHARS,
  );
}

export async function runAiProvider(
  provider: AiProvider,
  request: AiProviderRequest,
  options: AiProviderRunOptions = {},
): Promise<AiProviderRunResult> {
  if (
    !request ||
    typeof request !== "object" ||
    request.userConfirmed !== true
  )
    return { status: "failed", notice: buildAiFallbackNotice("unauthorized") };
  try {
    assertAiRequestPreview(request.preview);
  } catch {
    return { status: "failed", notice: buildAiFallbackNotice("unauthorized") };
  }
  if (
    !request.selectedData ||
    typeof request.selectedData !== "object" ||
    Array.isArray(request.selectedData)
  )
    return { status: "failed", notice: buildAiFallbackNotice("unauthorized") };
  const allowedFields = new Set(request.preview.includedFields);
  const unexpectedFields = Object.keys(request.selectedData).filter(
    (field) => !allowedFields.has(field),
  );
  if (unexpectedFields.length > 0)
    return { status: "failed", notice: buildAiFallbackNotice("unauthorized") };
  const selectedDataFields = Object.keys(request.selectedData);
  const maxPayloadChars = normalizeAiProviderPayloadChars(
    options.maxPayloadChars,
  );
  let serializedSelectedData: string;
  try {
    const serialized = JSON.stringify(request.selectedData);
    if (typeof serialized !== "string")
      return {
        status: "failed",
        notice: buildAiFallbackNotice("serialization-failed"),
      };
    serializedSelectedData = serialized;
  } catch {
    return {
      status: "failed",
      notice: buildAiFallbackNotice("serialization-failed"),
    };
  }
  if (serializedSelectedData.length > maxPayloadChars)
    return {
      status: "failed",
      notice: buildAiFallbackNotice("payload-too-large"),
    };
  let selectedDataSnapshot: Readonly<Record<string, unknown>>;
  try {
    const parsedSnapshot: unknown = JSON.parse(serializedSelectedData);
    if (
      !parsedSnapshot ||
      typeof parsedSnapshot !== "object" ||
      Array.isArray(parsedSnapshot)
    )
      return {
        status: "failed",
        notice: buildAiFallbackNotice("serialization-failed"),
      };
    const snapshotFields = Object.keys(parsedSnapshot);
    if (snapshotFields.some((field) => !allowedFields.has(field)))
      return { status: "failed", notice: buildAiFallbackNotice("unauthorized") };
    if (selectedDataFields.some((field) => !snapshotFields.includes(field)))
      return {
        status: "failed",
        notice: buildAiFallbackNotice("serialization-failed"),
      };
    selectedDataSnapshot = parsedSnapshot as Readonly<Record<string, unknown>>;
  } catch {
    return {
      status: "failed",
      notice: buildAiFallbackNotice("serialization-failed"),
    };
  }
  const providerRequest: AiProviderRequest = {
    ...request,
    selectedData: selectedDataSnapshot,
  };
  const timeoutMs = normalizeAiProviderTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new AiProviderFailure("timeout", "AI 服务响应超时"));
      }, timeoutMs);
    });
    const rawOutput = await Promise.race([
      provider.generateDraft(providerRequest, controller.signal),
      timeout,
    ]);
    assertAiDraftOutput(rawOutput);
    if (!draftScopesAreAuthorized(rawOutput, request.preview)) {
      return {
        status: "failed",
        notice: buildAiFallbackNotice("unauthorized"),
      };
    }
    const safety = evaluateAiDraftSafety(rawOutput);
    if (!safety.ok) return { status: "unsafe-output", safety };
    return { status: "success", draft: rawOutput, safety };
  } catch (error) {
    return {
      status: "failed",
      notice: buildAiFallbackNotice(failureFromUnknown(error)),
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
