import { describe, expect, it } from "vitest";
import { compassDirectionAt } from "@/content/compass";
import { assertCompassLayers, COMPASS_LAYERS } from "@/content/compass-layers";
import {
  directionIdAt,
  isDirectionBoundary,
  normalizeDegrees,
} from "@/core/compass/directions";
import {
  applyCompassCorrection,
  normalizeCompassCorrection,
  normalizeCompassCorrectionRecordForWrite,
} from "@/core/compass/correction";
import { normalizeCompassRecordForWrite } from "@/core/compass/records";
import {
  detectSensorPlatform,
  inspectSensorEnvironment,
} from "@/core/compass/platform";
import {
  assessCompassSensorCapability,
  assessSensorStability,
  headingFromOrientationSample,
} from "@/core/compass/sensor";

describe("360 度学习罗盘", () => {
  it("归一化角度并按顺时针八方映射", () => {
    expect(normalizeDegrees(-10)).toBe(350);
    expect(normalizeDegrees(370)).toBe(10);
    expect(directionIdAt(0)).toBe("north");
    expect(directionIdAt(44.9)).toBe("northeast");
    expect(directionIdAt(90)).toBe("east");
    expect(directionIdAt(359.9)).toBe("north");
  });

  it("边界归属稳定且数据标签与计算一致", () => {
    expect(isDirectionBoundary(22.5)).toBe(true);
    expect(compassDirectionAt(22.5).id).toBe("northeast");
    expect(compassDirectionAt(337.5).id).toBe("north");
    expect(() => normalizeDegrees(Number.NaN)).toThrow();
  });

  it("坐向记录写入时归一化角度并拒绝不一致快照", () => {
    const record = {
      id: "compass-record",
      degrees: -10,
      directionId: "north",
      layerId: "eight-directions-v1",
      ruleVersion: 1,
      title: "测试",
      environmentNote: "",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    } as const;
    expect(normalizeCompassRecordForWrite(record)).toMatchObject({ degrees: 350, directionId: "north" });
    expect(() => normalizeCompassRecordForWrite({ ...record, degrees: 90 })).toThrow("角度与方位不一致");
    expect(() => normalizeCompassRecordForWrite({ ...record, degrees: Number.NaN })).toThrow();
  });

  it("传感器偏差记录写入时限制在可解释范围", () => {
    const record = {
      id: "correction-record",
      offsetDegrees: 240,
      reason: "测试",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    } as const;
    expect(normalizeCompassCorrectionRecordForWrite(record)).toMatchObject({ offsetDegrees: 180 });
    expect(normalizeCompassCorrectionRecordForWrite({ ...record, offsetDegrees: -240 })).toMatchObject({ offsetDegrees: -180 });
    expect(() => normalizeCompassCorrectionRecordForWrite({ ...record, offsetDegrees: Number.NaN })).toThrow();
  });

  it("八方和已完成的二十四山盘层均可用", () => {
    expect(() => assertCompassLayers()).not.toThrow();
    expect(
      COMPASS_LAYERS.filter((layer) => layer.enabled).map((layer) => layer.id),
    ).toEqual(["eight-directions-v1", "twenty-four-mountains"]);
    expect(
      COMPASS_LAYERS.find((layer) => layer.id === "twenty-four-mountains"),
    ).toMatchObject({ enabled: true, status: "reviewed" });
  });

  it("能力探测只返回状态，不读取传感器，并保留手动回退", () => {
    expect(
      assessCompassSensorCapability({
        secureContext: false,
        hasDeviceOrientation: true,
        permissionRequestAvailable: false,
      }),
    ).toMatchObject({ status: "unsupported" });
    expect(
      assessCompassSensorCapability({
        secureContext: true,
        hasDeviceOrientation: true,
        permissionRequestAvailable: true,
      }),
    ).toMatchObject({ status: "permission-required" });
    expect(
      assessCompassSensorCapability({
        secureContext: true,
        hasDeviceOrientation: true,
        permissionRequestAvailable: false,
      }),
    ).toMatchObject({ status: "available" });
  });

  it("优先使用 WebKit 罗盘航向，并对绝对 alpha 明确标记为估算", () => {
    expect(
      headingFromOrientationSample({
        alpha: 90,
        absolute: true,
        webkitCompassHeading: 123.46,
      }),
    ).toMatchObject({
      degrees: 123.5,
      source: "webkit-compass-heading",
      accuracy: "unknown",
    });
    expect(
      headingFromOrientationSample({
        alpha: 90,
        absolute: true,
        screenOrientationDegrees: 90,
      }),
    ).toMatchObject({
      degrees: 0,
      source: "absolute-alpha-estimate",
      accuracy: "unknown",
    });
    expect(
      headingFromOrientationSample({ alpha: 90, absolute: false }),
    ).toBeNull();
    expect(
      headingFromOrientationSample({ alpha: null, absolute: true }),
    ).toBeNull();
  });

  it("以环形角度计算短窗口稳定性，不把稳定性当作准确度", () => {
    expect(assessSensorStability([359, 0, 1, 2])).toMatchObject({
      status: "stable",
      sampleCount: 4,
      meanDegrees: 0.5,
      spreadDegrees: 1.5,
      thresholdDegrees: 5,
    });
    expect(assessSensorStability([0, 30, 60, 90])).toMatchObject({
      status: "unstable",
      spreadDegrees: 45,
    });
    expect(assessSensorStability([10, 11])).toMatchObject({
      status: "collecting",
      sampleCount: 2,
    });
  });

  it("对稳定性窗口的非有限配置回退到安全默认值", () => {
    expect(
      assessSensorStability([10, 11, 12, 13], {
        windowSize: Number.NaN,
        minimumSamples: Number.POSITIVE_INFINITY,
        thresholdDegrees: Number.NaN,
      }),
    ).toMatchObject({
      status: "stable",
      sampleCount: 4,
      windowSize: 8,
      thresholdDegrees: 5,
    });
    expect(
      assessSensorStability([0, 10, 20], {
        windowSize: 1,
        minimumSamples: 1,
        thresholdDegrees: Number.NEGATIVE_INFINITY,
      }),
    ).toMatchObject({
      windowSize: 2,
      thresholdDegrees: 5,
    });
  });

  it("只对传感器航向应用有界的手动修正", () => {
    expect(normalizeCompassCorrection(12.56)).toBe(12.6);
    expect(normalizeCompassCorrection(240)).toBe(180);
    expect(normalizeCompassCorrection(-240)).toBe(-180);
    expect(applyCompassCorrection(355, 10)).toBe(5);
    expect(applyCompassCorrection(10, -20)).toBe(350);
  });

  it("识别真机验收所需的平台路径但不宣称测量通过", () => {
    expect(
      detectSensorPlatform({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1",
        vendor: "Apple Computer, Inc.",
        platform: "iPhone",
        maxTouchPoints: 5,
      }),
    ).toMatchObject({
      platform: "ios",
      browser: "safari",
      readingPath: "优先检查 WebKit 罗盘航向字段",
    });
    expect(
      inspectSensorEnvironment({
        userAgent:
          "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        secureContext: true,
        hasDeviceOrientation: true,
        permissionRequestAvailable: false,
        hasScreenOrientation: true,
        screenOrientationDegrees: 90,
      }),
    ).toMatchObject({
      capability: { status: "available" },
      platform: { platform: "android", browser: "chrome" },
      screenOrientationDegrees: 90,
    });
  });
});
