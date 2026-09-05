import {
  assessCompassSensorCapability,
  type SensorCapability,
} from "@/core/compass/sensor";

export type SensorPlatform = "ios" | "android" | "desktop" | "other";
export type SensorBrowser =
  "safari" | "chrome" | "firefox" | "webkit" | "other";

export interface SensorPlatformInfo {
  platform: SensorPlatform;
  platformLabel: string;
  browser: SensorBrowser;
  browserLabel: string;
  likelyMobile: boolean;
  readingPath: string;
}

export interface SensorEnvironmentSnapshot {
  capability: SensorCapability;
  platform: SensorPlatformInfo;
  hasScreenOrientation: boolean;
  screenOrientationDegrees: number | null;
}

export interface SensorEnvironmentInput {
  userAgent: string;
  vendor?: string;
  platform?: string;
  maxTouchPoints?: number;
  secureContext: boolean;
  hasDeviceOrientation: boolean;
  permissionRequestAvailable: boolean;
  hasScreenOrientation: boolean;
  screenOrientationDegrees?: number | null;
}

export function detectSensorPlatform(
  input: Pick<
    SensorEnvironmentInput,
    "userAgent" | "vendor" | "platform" | "maxTouchPoints"
  >,
): SensorPlatformInfo {
  const userAgent = input.userAgent.toLowerCase();
  const vendor = (input.vendor ?? "").toLowerCase();
  const platform = (input.platform ?? "").toLowerCase();
  const touchPoints = input.maxTouchPoints ?? 0;
  const ios =
    /iphone|ipad|ipod/.test(userAgent) ||
    (/macintosh/.test(userAgent) && touchPoints > 1);
  const android = /android/.test(userAgent);
  const browser: SensorBrowser = /firefox|fxios/.test(userAgent)
    ? "firefox"
    : /crios|chrome|chromium|edg\//.test(userAgent)
      ? "chrome"
      : /safari/.test(userAgent) && !/chrome|crios|android/.test(userAgent)
        ? "safari"
        : /applewebkit/.test(userAgent) || /apple/.test(vendor)
          ? "webkit"
          : "other";
  const sensorPlatform: SensorPlatform = ios
    ? "ios"
    : android
      ? "android"
      : /win|mac|linux|cros/.test(platform) ||
          /windows|macintosh|x11|linux/.test(userAgent)
        ? "desktop"
        : "other";
  const platformLabel =
    sensorPlatform === "ios"
      ? "iOS"
      : sensorPlatform === "android"
        ? "Android"
        : sensorPlatform === "desktop"
          ? "桌面系统"
          : "其他平台";
  const browserLabel =
    browser === "safari"
      ? "Safari"
      : browser === "chrome"
        ? "Chrome/Chromium"
        : browser === "firefox"
          ? "Firefox"
          : browser === "webkit"
            ? "WebKit 浏览器"
            : "其他浏览器";
  const likelyMobile = sensorPlatform === "ios" || sensorPlatform === "android";
  const readingPath =
    sensorPlatform === "ios" && browser === "safari"
      ? "优先检查 WebKit 罗盘航向字段"
      : likelyMobile
        ? "等待 absolute 方向事件；结果按估算处理"
        : "桌面环境通常没有可用的设备方向数据";
  return {
    platform: sensorPlatform,
    platformLabel,
    browser,
    browserLabel,
    likelyMobile,
    readingPath,
  };
}

export function inspectSensorEnvironment(
  input: SensorEnvironmentInput,
): SensorEnvironmentSnapshot {
  return {
    capability: assessCompassSensorCapability(input),
    platform: detectSensorPlatform(input),
    hasScreenOrientation: input.hasScreenOrientation,
    screenOrientationDegrees:
      typeof input.screenOrientationDegrees === "number" &&
      Number.isFinite(input.screenOrientationDegrees)
        ? input.screenOrientationDegrees
        : null,
  };
}
