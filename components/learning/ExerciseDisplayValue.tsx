import { TrigramSignatureVisual, isTrigramSignature } from "@/components/hexagram/TrigramSignatureVisual";
import { parseLinePositionDisplay } from "@/core/exercises/display";

const POSITION_NAMES = ["初爻", "二爻", "三爻", "四爻", "五爻", "上爻"] as const;

export function ExerciseDisplayValue({ value }: { value: string }) {
  const activePosition = parseLinePositionDisplay(value);
  if (activePosition !== null) {
    const positionName = POSITION_NAMES[activePosition - 1];
    return (
      <div className="line-position-visual" role="img" aria-label={`六爻卦象，高亮${positionName}`}>
        {[6, 5, 4, 3, 2, 1].map((position) => (
          <span className={position === activePosition ? "is-active" : ""} key={position}>
            <i />
            <small aria-hidden="true">{position === activePosition ? "◀" : ""}</small>
          </span>
        ))}
      </div>
    );
  }
  if (isTrigramSignature(value)) return <TrigramSignatureVisual value={value} />;
  return <>{value}</>;
}

