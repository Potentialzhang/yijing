import { z } from "zod";
import type { ContentSource } from "@/content/sources";
import { assertContentSourceRegistration } from "@/core/content/validate";

export interface ContentSourceHandoff {
  templateVersion: 1;
  purpose: "content-source-registration";
  sources: readonly ContentSource[];
}

const sourceHandoffSchema = z.object({
  templateVersion: z.literal(1),
  purpose: z.literal("content-source-registration"),
  sources: z.array(z.unknown()).min(1),
}).strict();

function parseJson(input: string): unknown {
  if (!input.trim()) throw new TypeError("来源登记表不能为空");
  try {
    return JSON.parse(input);
  } catch {
    throw new TypeError("来源登记表 JSON 无法解析");
  }
}

/** Validate a source-registration handoff without mutating the built-in registry. */
export function parseContentSourceHandoff(
  input: unknown,
): ContentSourceHandoff {
  const value = typeof input === "string" ? parseJson(input) : input;
  const parsed = sourceHandoffSchema.safeParse(value);
  if (!parsed.success) throw new TypeError("来源登记表字段无效");
  const sources = parsed.data.sources.map((source, index) => {
    try {
      assertContentSourceRegistration(source);
    } catch (error) {
      throw new TypeError(
        `来源登记表第 ${index + 1} 条无效：${error instanceof Error ? error.message : "字段不完整"}`,
      );
    }
    return source as ContentSource;
  });
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new TypeError("来源登记表存在重复 ID");
  }
  return {
    templateVersion: 1,
    purpose: "content-source-registration",
    sources,
  };
}

export function serializeContentSourceHandoff(
  sources: readonly ContentSource[],
): string {
  const handoff: ContentSourceHandoff = {
    templateVersion: 1,
    purpose: "content-source-registration",
    sources,
  };
  // Reuse the same strict parser before serializing so callers cannot create
  // a handoff that the reviewer page would reject when it is loaded again.
  parseContentSourceHandoff(handoff);
  return JSON.stringify(handoff, null, 2);
}
