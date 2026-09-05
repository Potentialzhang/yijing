import { ReviewTargetLearningStatus } from "@/components/review/ReviewTargetLearningStatus";

export function TrigramLearningStatus({ trigramId }: { trigramId: string }) {
  return <ReviewTargetLearningStatus targetType="trigram" targetId={trigramId} />;
}
