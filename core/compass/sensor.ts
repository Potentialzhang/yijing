export type SensorCapabilityStatus =
  "unsupported" | "permission-required" | "available";

export interface SensorCapabilityInput {
  secureContext: boolean;
  hasDeviceOrientation: boolean;
  permissionRequestAvailable: boolean;
}

export interface SensorCapability {
  status: SensorCapabilityStatus;
  secureContext: boolean;
  hasDeviceOrientation: boolean;
  permissionRequestAvailable: boolean;
  reason: string;
}

export interface OrientationSample {
  alpha: number | null;
  absolute: boolean;
  /** WebKit's real-world heading, when supplied by iOS Safari. */
  webkitCompassHeading?: number | null;
  /** Screen rotation in degrees, used only for the absolute-alpha estimate. */
  screenOrientationDegrees?: number;
}

export type SensorHeadingSource =
  "webkit-compass-heading" | "absolute-alpha-estimate";

export interface SensorHeading {
  degrees: number;
  source: SensorHeadingSource;
  accuracy: "unknown";
}

export type SensorStabilityStatus = "collecting" | "unstable" | "stable";

export interface SensorStability {
  status: SensorStabilityStatus;
  sampleCount: number;
  windowSize: number;
  meanDegrees: number | null;
  spreadDegrees: number | null;
  thresholdDegrees: number;
}

/**
 * Pure capability assessment for M3-B01. It never asks for permission and
 * never consumes a sensor event; the caller remains in manual mode.
 */
export function assessCompassSensorCapability(
  input: SensorCapabilityInput,
): SensorCapability {
  if (!input.secureContext || !input.hasDeviceOrientation) {
    return {
      ...input,
      status: "unsupported",
      reason: !input.secureContext
        ? "方向传感器需要 HTTPS 或安全上下文。"
        : "当前浏览器没有 DeviceOrientation 能力。",
    };
  }
  if (input.permissionRequestAvailable)
    return {
      ...input,
      status: "permission-required",
      reason: "设备可能支持方向事件，但需要用户手势授权。",
    };
  return {
    ...input,
    status: "available",
    reason: "环境支持方向事件；默认保持手动模式，可在你点击后开始读取。",
  };
}

/**
 * Convert one device-orientation sample into a compass heading. WebKit's
 * compass heading is preferred; absolute alpha is deliberately labelled an
 * estimate because platform coordinate conventions and device calibration vary.
 */
export function headingFromOrientationSample(
  sample: OrientationSample,
): SensorHeading | null {
  if (
    typeof sample.webkitCompassHeading === "number" &&
    Number.isFinite(sample.webkitCompassHeading)
  ) {
    return {
      degrees: normalizeHeading(sample.webkitCompassHeading),
      source: "webkit-compass-heading",
      accuracy: "unknown",
    };
  }
  if (
    !sample.absolute ||
    typeof sample.alpha !== "number" ||
    !Number.isFinite(sample.alpha)
  )
    return null;
  const orientation =
    typeof sample.screenOrientationDegrees === "number" &&
    Number.isFinite(sample.screenOrientationDegrees)
      ? sample.screenOrientationDegrees
      : 0;
  return {
    degrees: normalizeHeading(360 - sample.alpha + orientation),
    source: "absolute-alpha-estimate",
    accuracy: "unknown",
  };
}

/**
 * Assess repeatability over a short rolling heading window. This is a
 * stability hint, not a sensor accuracy claim: magnetic interference and
 * platform calibration are outside the browser API contract.
 */
export function assessSensorStability(
  samples: readonly number[],
  options: {
    windowSize?: number;
    minimumSamples?: number;
    thresholdDegrees?: number;
  } = {},
): SensorStability {
  const windowSize = normalizePositiveInteger(options.windowSize, 8, 2);
  const minimumSamples = Math.min(
    windowSize,
    normalizePositiveInteger(options.minimumSamples, 4, 2),
  );
  const thresholdDegrees = normalizeFiniteMinimum(
    options.thresholdDegrees,
    5,
    0.1,
  );
  const window = samples
    .filter((value) => Number.isFinite(value))
    .slice(-windowSize)
    .map(normalizeHeading);
  if (window.length === 0) {
    return {
      status: "collecting",
      sampleCount: 0,
      windowSize,
      meanDegrees: null,
      spreadDegrees: null,
      thresholdDegrees,
    };
  }
  const radians = window.map((value) => (value * Math.PI) / 180);
  const meanRadians = Math.atan2(
    radians.reduce((sum, value) => sum + Math.sin(value), 0),
    radians.reduce((sum, value) => sum + Math.cos(value), 0),
  );
  const meanDegrees = normalizeHeading((meanRadians * 180) / Math.PI);
  const spreadDegrees = Number(
    Math.max(
      ...window.map((value) => angularDistance(value, meanDegrees)),
    ).toFixed(1),
  );
  return {
    status:
      window.length < minimumSamples
        ? "collecting"
        : spreadDegrees <= thresholdDegrees
          ? "stable"
          : "unstable",
    sampleCount: window.length,
    windowSize,
    meanDegrees,
    spreadDegrees,
    thresholdDegrees,
  };
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, Math.floor(value))
    : fallback;
}

function normalizeFiniteMinimum(
  value: number | undefined,
  fallback: number,
  minimum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(minimum, value)
    : fallback;
}

function angularDistance(first: number, second: number): number {
  const distance = Math.abs(normalizeHeading(first) - normalizeHeading(second));
  return Math.min(distance, 360 - distance);
}

function normalizeHeading(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : Number(normalized.toFixed(1));
}
