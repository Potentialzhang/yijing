/** Normalize free-form exercise answers without changing their meaning. */
export function normalizeExerciseAnswer(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

export function isExerciseAnswerCorrect(answer: string, expected: string): boolean {
  return normalizeExerciseAnswer(answer) === normalizeExerciseAnswer(expected);
}
