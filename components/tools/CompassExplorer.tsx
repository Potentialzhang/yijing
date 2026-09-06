"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { COMPASS_DIRECTIONS, compassDirectionAt } from "@/content/compass";
import { COMPASS_LAYERS, type CompassLayerId } from "@/content/compass-layers";
import { normalizeDegrees } from "@/core/compass/directions";
import {
  assessCompassSensorCapability,
  assessSensorStability,
  headingFromOrientationSample,
  type SensorCapability,
  type SensorStability,
  type SensorHeading,
} from "@/core/compass/sensor";
import {
  inspectSensorEnvironment,
  type SensorEnvironmentSnapshot,
} from "@/core/compass/platform";
import { CompassRecords } from "@/components/tools/CompassRecords";
import { CompassCorrection } from "@/components/tools/CompassCorrection";
import type { CompassRecord } from "@/db/schema";
import { applyCompassCorrection } from "@/core/compass/correction";
import { mountainAt, mountainBearing } from "@/content/mountains";
import { MountainDial } from "@/components/tools/MountainDial";

type CompassMode = "explore" | "hide-labels";

function readDegrees(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? normalizeDegrees(parsed) : 0;
}

export function CompassExplorer() {
  const [degrees, setDegrees] = useState(0);
  const [mode, setMode] = useState<CompassMode>("explore");
  const [layerId, setLayerId] = useState<CompassLayerId>("eight-directions-v1");
  const [sensorCapability, setSensorCapability] =
    useState<SensorCapability | null>(null);
  const [sensorEnvironment, setSensorEnvironment] =
    useState<SensorEnvironmentSnapshot | null>(null);
  const [sensorActive, setSensorActive] = useState(false);
  const [sensorReading, setSensorReading] = useState<SensorHeading | null>(
    null,
  );
  const [sensorStability, setSensorStability] =
    useState<SensorStability | null>(null);
  const [sensorMessage, setSensorMessage] = useState("");
  const [sensorStarting, setSensorStarting] = useState(false);
  const sensorCleanupRef = useRef<(() => void) | null>(null);
  const sensorStartTokenRef = useRef(0);
  const sensorStartingRef = useRef(false);
  const modeFocusTarget = useRef<CompassMode | null>(null);
  const sensorSamplesRef = useRef<number[]>([]);
  const correctionRef = useRef(0);
  const [correctionDegrees, setCorrectionDegrees] = useState(0);
  const manualDegreesRef = useRef(degrees);
  const activeDegrees = degrees;
  const direction = useMemo(
    () => compassDirectionAt(activeDegrees),
    [activeDegrees],
  );
  const activeLayer =
    COMPASS_LAYERS.find((layer) => layer.id === layerId) ?? COMPASS_LAYERS[0];
  const formatted = activeDegrees.toFixed(1);
  const isMountains = layerId === "twenty-four-mountains";
  const mountain = mountainAt(activeDegrees);
  const bearing = mountainBearing(activeDegrees);
  const target = isMountains ? { id: mountain.id, label: mountain.name + "山", centerDegrees: mountain.centerDegrees, rangeLabel: `${mountain.startDegrees}°–${mountain.endDegrees}°`, mnemonic: `地盘正针 · 正五行属${mountain.element}。以当前角度为朝向：坐${bearing.sitting.name}向${bearing.facing.name}。` } : direction;
  const modes: readonly { id: CompassMode; label: string }[] = [
    { id: "explore", label: "自由探索" },
    { id: "hide-labels", label: "隐藏标签" },
  ];
  function changeMode(next: CompassMode) {
    if (sensorStartingRef.current && next !== mode) stopSensor();
    setMode(next);
  }

  useEffect(() => {
    const target = modeFocusTarget.current;
    if (target === null) return;
    modeFocusTarget.current = null;
    document.querySelector<HTMLButtonElement>(
      `.compass-explorer .relation-mode button[data-mode="${target}"]`,
    )?.focus();
  }, [mode]);
  function moveMode(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? modes.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "ArrowDown"
          ? (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + modes.length) % modes.length
          : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = modes[nextIndex];
    modeFocusTarget.current = next.id;
    changeMode(next.id);
  }

  function restoreRecord(record: CompassRecord) {
    stopSensor();
    setDegrees(normalizeDegrees(record.degrees));
    setMode("explore");
  }

  function detectSensorCapability() {
    const deviceOrientation =
      "DeviceOrientationEvent" in window
        ? (window.DeviceOrientationEvent as unknown as {
            requestPermission?: unknown;
          })
        : undefined;
    const environment = inspectSensorEnvironment({
      userAgent: navigator.userAgent,
      vendor: navigator.vendor,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      secureContext: window.isSecureContext,
      hasDeviceOrientation: Boolean(deviceOrientation),
      permissionRequestAvailable:
        typeof deviceOrientation?.requestPermission === "function",
      hasScreenOrientation: "orientation" in screen,
      screenOrientationDegrees:
        typeof screen.orientation?.angle === "number"
          ? screen.orientation.angle
          : null,
    });
    setSensorEnvironment(environment);
    setSensorCapability(environment.capability);
  }

  function stopSensor() {
    sensorStartTokenRef.current += 1;
    sensorStartingRef.current = false;
    setSensorStarting(false);
    const wasActive = sensorCleanupRef.current !== null;
    sensorCleanupRef.current?.();
    sensorCleanupRef.current = null;
    setSensorActive(false);
    setSensorReading(null);
    sensorSamplesRef.current = [];
    setSensorStability(null);
    if (wasActive) {
      setDegrees(manualDegreesRef.current);
      setSensorMessage("已停止读取，已回到开始读取前的手动角度。");
    }
  }

  const changeCorrection = useCallback((offsetDegrees: number) => {
    correctionRef.current = offsetDegrees;
    setCorrectionDegrees(offsetDegrees);
  }, []);

  async function startSensor() {
    if (sensorStartingRef.current || sensorActive) return;
    sensorStartingRef.current = true;
    setSensorStarting(true);
    const startToken = ++sensorStartTokenRef.current;
    const eventConstructor =
      "DeviceOrientationEvent" in window
        ? (window.DeviceOrientationEvent as unknown as {
            requestPermission?: () => Promise<string>;
          })
        : undefined;
    const capability = assessCompassSensorCapability({
      secureContext: window.isSecureContext,
      hasDeviceOrientation: Boolean(eventConstructor),
      permissionRequestAvailable:
        typeof eventConstructor?.requestPermission === "function",
    });
    setSensorEnvironment(
      inspectSensorEnvironment({
        userAgent: navigator.userAgent,
        vendor: navigator.vendor,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        secureContext: window.isSecureContext,
        hasDeviceOrientation: Boolean(eventConstructor),
        permissionRequestAvailable:
          typeof eventConstructor?.requestPermission === "function",
        hasScreenOrientation: "orientation" in screen,
        screenOrientationDegrees:
          typeof screen.orientation?.angle === "number"
            ? screen.orientation.angle
            : null,
      }),
    );
    setSensorCapability(capability);
    if (capability.status === "unsupported") {
      setSensorMessage(`${capability.reason} 已保持手动模式。`);
      sensorStartingRef.current = false;
      setSensorStarting(false);
      return;
    }
    if (eventConstructor?.requestPermission) {
      try {
        const permission = await eventConstructor.requestPermission();
        if (startToken !== sensorStartTokenRef.current) return;
        if (permission !== "granted") {
          setSensorMessage("方向权限未授予，已保持手动模式。");
          sensorStartingRef.current = false;
          setSensorStarting(false);
          return;
        }
      } catch {
        if (startToken !== sensorStartTokenRef.current) return;
        setSensorMessage("方向权限请求失败，已保持手动模式。");
        sensorStartingRef.current = false;
        setSensorStarting(false);
        return;
      }
    }
    if (startToken !== sensorStartTokenRef.current) return;
    manualDegreesRef.current = degrees;
    setSensorReading(null);
    sensorSamplesRef.current = [];
    setSensorStability(assessSensorStability([]));
    const handler = (event: DeviceOrientationEvent) => {
      const screenOrientationDegrees =
        typeof screen.orientation?.angle === "number"
          ? screen.orientation.angle
          : 0;
      const heading = headingFromOrientationSample({
        alpha: event.alpha,
        absolute: event.absolute,
        webkitCompassHeading: (
          event as DeviceOrientationEvent & {
            webkitCompassHeading?: number | null;
          }
        ).webkitCompassHeading,
        screenOrientationDegrees,
      });
      if (!heading) return;
      const correctedDegrees = applyCompassCorrection(
        heading.degrees,
        correctionRef.current,
      );
      const correctedHeading = { ...heading, degrees: correctedDegrees };
      sensorSamplesRef.current = [
        ...sensorSamplesRef.current,
        correctedDegrees,
      ].slice(-8);
      const stability = assessSensorStability(sensorSamplesRef.current);
      setDegrees(correctedDegrees);
      setSensorReading(correctedHeading);
      setSensorStability(stability);
      setSensorMessage(
        `传感器读数 ${correctedDegrees.toFixed(1)}°${
          correctionRef.current === 0
            ? ""
            : `（已应用 ${correctionRef.current > 0 ? "+" : ""}${correctionRef.current.toFixed(1)}° 修正）`
        }；${
          stability.status === "stable"
            ? "短窗口内较稳定"
            : stability.status === "unstable"
              ? "短窗口内波动较大"
              : "正在收集稳定性样本"
        }；精度未知，仅供学习。`,
      );
    };
    window.addEventListener("deviceorientation", handler as EventListener);
    window.addEventListener(
      "deviceorientationabsolute",
      handler as EventListener,
    );
    sensorCleanupRef.current = () => {
      window.removeEventListener("deviceorientation", handler as EventListener);
      window.removeEventListener(
        "deviceorientationabsolute",
        handler as EventListener,
      );
    };
    setSensorActive(true);
    sensorStartingRef.current = false;
    setSensorStarting(false);
    setSensorMessage("正在等待方向数据；请保持设备平稳。精度未知，仅供学习。");
  }

  useEffect(
    () => () => {
      sensorStartTokenRef.current += 1;
      sensorStartingRef.current = false;
      sensorCleanupRef.current?.();
    },
    [],
  );

  return (
    <section className="compass-explorer" aria-label="360度基础罗盘">
      <div className="compass-controls">
        <div className="relation-mode" role="tablist" aria-label="罗盘学习模式">
          {modes.map((item, index) => (
            <button
              type="button"
              role="tab"
              id={`compass-mode-${item.id}`}
              data-mode={item.id}
              tabIndex={mode === item.id ? 0 : -1}
              key={item.id}
              className={mode === item.id ? "selected" : ""}
              aria-selected={mode === item.id}
              aria-controls="compass-mode-panel"
              onKeyDown={(event) => moveMode(event, index)}
              onClick={() => changeMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div
          className="compass-layer-switcher"
          role="group"
          aria-label="罗盘盘层"
        >
          <span>当前盘层</span>
          {COMPASS_LAYERS.map((layer) => (
            <button
              type="button"
              key={layer.id}
              className={layer.id === layerId ? "selected" : ""}
              aria-pressed={layer.id === layerId}
              disabled={!layer.enabled}
              onClick={() => setLayerId(layer.id)}
            >
              {layer.label}
              {!layer.enabled && <small>待确认</small>}
            </button>
          ))}
        </div>
        <p className="compass-layer-description">
          <strong>{activeLayer.system}</strong> · {activeLayer.description}
        </p>
        <div className="compass-sensor-check">
          <div>
            <strong>设备方向（可选）</strong>
            <small>
              只在你点击后读取；需要 HTTPS 和设备授权，结果不写入记录。
            </small>
          </div>
          <div className="compass-sensor-actions">
            <button
              type="button"
              className="outline-button"
              onClick={detectSensorCapability}
              disabled={sensorStarting}
            >
              检测设备能力
            </button>
            {sensorCapability &&
              sensorCapability.status !== "unsupported" &&
              !sensorActive && (
                <button
                type="button"
                className="outline-button"
                onClick={() => void startSensor()}
                disabled={sensorStarting}
              >
                  {sensorStarting ? "正在请求方向权限…" : "开始读取方向"}
                </button>
              )}
            {sensorActive && (
              <button
                type="button"
                className="outline-button"
                onClick={stopSensor}
              >
                停止读取方向
              </button>
            )}
          </div>
          {sensorCapability && (
            <p role="status">
              {sensorCapability.reason}{" "}
              {sensorCapability.status === "unsupported"
                ? "已保持手动模式。"
                : ""}
            </p>
          )}
          {sensorMessage && <p role="status">{sensorMessage}</p>}
          {sensorActive && sensorStability && (
            <p role="status">
              稳定性提示：
              {sensorStability.status === "stable"
                ? `最近 ${sensorStability.sampleCount} 个读数的最大波动约 ${sensorStability.spreadDegrees?.toFixed(1)}°，仅表示短窗口可重复。`
                : sensorStability.status === "unstable"
                  ? `最近 ${sensorStability.sampleCount} 个读数的最大波动约 ${sensorStability.spreadDegrees?.toFixed(1)}°；请远离磁铁、金属和电流设备，并缓慢转动设备。`
                  : `正在收集读数（${sensorStability.sampleCount}/${sensorStability.windowSize}），请保持设备平稳。`}
            </p>
          )}
          {sensorEnvironment && (
            <details className="compass-sensor-diagnostics">
              <summary>平台诊断（用于真机验收）</summary>
              <dl>
                <div>
                  <dt>平台</dt>
                  <dd>{sensorEnvironment.platform.platformLabel}</dd>
                </div>
                <div>
                  <dt>浏览器</dt>
                  <dd>{sensorEnvironment.platform.browserLabel}</dd>
                </div>
                <div>
                  <dt>读取路径</dt>
                  <dd>{sensorEnvironment.platform.readingPath}</dd>
                </div>
                <div>
                  <dt>安全上下文</dt>
                  <dd>
                    {sensorEnvironment.capability.secureContext ? "是" : "否"}
                  </dd>
                </div>
                <div>
                  <dt>方向事件 API</dt>
                  <dd>
                    {sensorEnvironment.capability.hasDeviceOrientation
                      ? "有"
                      : "无"}
                  </dd>
                </div>
                <div>
                  <dt>授权接口</dt>
                  <dd>
                    {sensorEnvironment.capability.permissionRequestAvailable
                      ? "需要手势授权"
                      : "未暴露"}
                  </dd>
                </div>
                <div>
                  <dt>屏幕方向 API</dt>
                  <dd>
                    {sensorEnvironment.hasScreenOrientation
                      ? `${sensorEnvironment.screenOrientationDegrees ?? 0}°`
                      : "无"}
                  </dd>
                </div>
              </dl>
              <small>
                诊断信息只用于记录验收条件，不代表设备读数准确，也不会上传。
              </small>
            </details>
          )}
        </div>
        <CompassCorrection
          offsetDegrees={correctionDegrees}
          onOffsetChange={changeCorrection}
        />
        <label htmlFor="compass-degrees">
          手动输入角度（0°=北，顺时针）
          <input
            id="compass-degrees"
            type="number"
            min="0"
            max="359.9"
            step="0.1"
            value={degrees.toFixed(1)}
            onChange={(event) => {
              stopSensor();
              setDegrees(readDegrees(event.target.value));
            }}
          />
        </label>
        <label htmlFor="compass-slider">
          拖动角度
          <input
            id="compass-slider"
            type="range"
            min="0"
            max="359.9"
            step="0.1"
            value={degrees}
            onChange={(event) => {
              stopSensor();
              setDegrees(readDegrees(event.target.value));
            }}
          />
        </label>
        <p>
          当前角度 <strong>{formatted}°</strong> · {activeLayer.label}：
          <strong>{target.label}</strong>
        </p>
      </div>
      <div className="compass-stage">
        {isMountains ? <MountainDial degrees={activeDegrees} hideLabels={mode === "hide-labels"} showAnswer onSelect={value => {
          stopSensor();
          setDegrees(value);
        }} /> : <>
        <div className="compass-marker" aria-hidden="true">
          ▲
        </div>
        <div
          className="compass-dial"
          role="group"
          style={{ transform: `rotate(${-activeDegrees}deg)` }}
          aria-label={`当前盘面旋转 ${formatted} 度`}
        >
          {COMPASS_DIRECTIONS.map((item) => (
            <button type="button" key={item.id} className={`compass-label compass-${item.id} ${target.id === item.id ? "is-current" : ""}`} aria-pressed={target.id === item.id} onClick={() => {
              stopSensor();
              setDegrees(item.centerDegrees);
            }}>
              {mode === "hide-labels" ? (
                <span aria-hidden="true">•</span>
              ) : (
                <>
                  {item.shortLabel}
                  <small>{item.label}</small>
                </>
              )}
            </button>
          ))}
          <div className="compass-center" aria-hidden="true">
            易
          </div>
        </div>
        </>}
      </div>
      <article
        id="compass-mode-panel"
        className="compass-reading"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`compass-mode-${mode}`}
      >
        <span className="content-label">
          {sensorReading ? "传感器读数 · " : "程序计算 · "}
          {activeLayer.label}
        </span>
        <h2>
          {target.label} · {formatted}°
        </h2>
        <p>
          {target.mnemonic}
        </p>
        <div className="compass-facts">
          <span>
            中心角<strong>{target.centerDegrees}°</strong>
          </span>
          <span>
            学习范围<strong>{target.rangeLabel}</strong>
          </span>
        </div>
        <small>
          {sensorReading
            ? `设备读数可能受磁干扰、姿态和平台实现影响，精度未知，仅供学习；${sensorStability?.status === "stable" ? "当前仅表示短窗口内较稳定，不代表绝对准确。" : "请以稳定性提示判断是否需要重新观察。"}停止读取后可回到手动模式。`
            : "手动学习盘不读取设备传感器：角度以北为 0°、顺时针增加；二十四山采用地盘正针，区间含起点不含终点。"}
        </small>
      </article>
      <CompassRecords
        degrees={degrees}
        allowSave={!sensorActive}
        onRestore={restoreRecord}
      />
    </section>
  );
}
