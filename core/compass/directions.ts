export type CompassDirectionId = "north" | "northeast" | "east" | "southeast" | "south" | "southwest" | "west" | "northwest";

/**
 * A heading is measured clockwise from north. The math in this module is
 * deliberately independent from sensors, geomancy schools, and 24-mountain
 * boundaries so it can be tested as a small, stable domain primitive.
 */
export function normalizeDegrees(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("角度必须是有限数字");
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function directionIndex(degrees: number): number {
  return Math.floor((normalizeDegrees(degrees) + 22.5) / 45) % 8;
}

export function directionIdAt(degrees: number): CompassDirectionId {
  return ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][directionIndex(degrees)] as CompassDirectionId;
}

export function directionCenter(degrees: number): number {
  return directionIndex(degrees) * 45;
}

export function isDirectionBoundary(degrees: number): boolean {
  return Math.abs((normalizeDegrees(degrees) + 22.5) % 45) < 0.000001;
}
