import type { RecallGrade } from "./scheduler";

const GRADE_SCORE: Record<RecallGrade, number> = { forgot: 0, hard: 0.4, remembered: 0.75, mastered: 1 };
const VALID_GRADES = new Set<RecallGrade>(["forgot", "hard", "remembered", "mastered"]);

export function calculateMastery(grades: readonly RecallGrade[]): number {
  const recent = grades.slice(-20).filter((grade): grade is RecallGrade => VALID_GRADES.has(grade));
  if (recent.length === 0) return 0;
  return Math.round((recent.reduce((sum, grade) => sum + GRADE_SCORE[grade], 0) / recent.length) * 100);
}

export function masteryStatus(score: number): "not_started" | "learning" | "reviewing" | "mastered" {
  if (!Number.isFinite(score)) return "not_started";
  if (score <= 0) return "not_started";
  if (score < 40) return "learning";
  if (score < 80) return "reviewing";
  return "mastered";
}
