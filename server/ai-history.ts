import { withDb } from "@/server/db";

export interface AiGenerationHistoryItem {
  id: string;
  taskKind: string;
  status: "completed" | "failed";
  sourceIds: string[];
  outputText: string;
  provider: string | null;
  model: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export async function getAiGenerationHistory(userId: string): Promise<AiGenerationHistoryItem[]> {
  try {
    const result = await withDb(client => client.query<{
      id: string; task_kind: string; status: "completed" | "failed"; source_ids: string[]; output_text: string;
      provider: string | null; model: string | null; error_message: string | null; created_at: Date;
    }>(`SELECT id,task_kind,status,source_ids,output_text,provider,model,error_message,created_at
        FROM ai_generations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [userId]));
    return result.rows.map(item => ({
      id: item.id, taskKind: item.task_kind, status: item.status, sourceIds: item.source_ids,
      outputText: item.output_text, provider: item.provider, model: item.model, errorMessage: item.error_message,
      createdAt: item.created_at.toISOString(),
    }));
  } catch {
    return [];
  }
}
