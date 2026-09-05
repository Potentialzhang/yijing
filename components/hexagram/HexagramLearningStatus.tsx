import { ReviewTargetLearningStatus } from "@/components/review/ReviewTargetLearningStatus";

export function HexagramLearningStatus({ hexagramId }: { hexagramId: string }) {
  return <ReviewTargetLearningStatus targetType="hexagram" targetId={hexagramId} />;
}
