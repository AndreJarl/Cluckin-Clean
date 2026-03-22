import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Progress from "react-native-progress";
import { onValue, ref, update } from "firebase/database";

import { db } from "@/lib/firebase";

const DEVICE_ID = "conveyorCleaner01";
const PWM_MIN = 0;
const PWM_MAX = 255;
const BIN_MIN_G = 500;
const BIN_MAX_G = 10000;

type DeviceStatus = {
  wifiConnected?: boolean;
  updatedAtMs?: number;
  conveyor?: {
    isOn?: boolean;
    lastChanged?: number;
  };
  control?: {
    manualRun?: boolean;
    manualPwm?: number;
  };
  settings?: {
    binFullThresholdGrams?: number;
  };
  auto?: {
    running?: boolean;
    activeScheduleId?: string;
    pwm?: number;
  };
  loadCell?: {
    raw?: number;
    weightGrams?: number;
    weightKg?: number;
    loadPresent?: boolean;
    binFull?: boolean;
  };
  ultrasonic?: {
    distanceCm?: number;
  };
  rtc?: {
    dateTime?: string;
  };
  servo?: {
    opened?: boolean;
  };
};

type ControlState = {
  manualRun?: boolean;
  manualPwm?: number;
};

type DeviceSettings = {
  binFullThresholdGrams?: number;
};

type HistoryItem = {
  id: string;
  title?: string;
  status?: "EXECUTED" | "FAILED" | "SKIPPED" | string;
  date?: string;
  hour?: string;
  minute?: string;
  duration?: string;
  executedAt?: number;
  scheduleId?: string;
};

type RtcSyncState = {
  syncRtc?: boolean;
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  requestedAt?: number;
};

function formatUpdatedAge(updatedAtMs?: number) {
  if (!updatedAtMs) return "--";
  const seconds = Math.floor((Date.now() - updatedAtMs) / 1000);

  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function formatTimestamp(ts?: number) {
  if (!ts) return "--";
  return new Date(ts).toLocaleString();
}

function formatTo12Hour(hour?: string, minute?: string) {
  if (!hour || !minute) return "--";
  let h = Number(hour);
  const m = String(minute).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";

  h = h % 12;
  if (h === 0) h = 12;

  return `${h}:${m} ${period}`;
}

function clampPwm(value: number) {
  return Math.max(PWM_MIN, Math.min(PWM_MAX, Math.round(value)));
}

function clampBinThreshold(value: number) {
  return Math.max(BIN_MIN_G, Math.min(BIN_MAX_G, Math.round(value)));
}

function getPwmPresetLabel(pwm: number) {
  if (pwm <= 130) return "Gentle";
  if (pwm <= 210) return "Normal";
  return "Strong";
}

function formatWeightLabel(grams: number) {
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${Number.isInteger(kg) ? kg.toFixed(0) : kg.toFixed(1)} kg`;
  }
  return `${Math.round(grams)} g`;
}

function mapHistory(
  value: Record<string, Omit<HistoryItem, "id">> | null | undefined
): HistoryItem[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, item]) => ({
      id,
      ...(item as Omit<HistoryItem, "id">),
    }))
    .sort((a, b) => Number(b.executedAt ?? 0) - Number(a.executedAt ?? 0));
}

const Card = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.card}>{children}</View>
);

const MetricCard = ({
  title,
  value,
  sub,
  icon,
  color,
  bg,
}: {
  title: string;
  value: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  bg: string;
}) => (
  <View style={styles.metricCard}>
    <View style={[styles.metricIconWrap, { backgroundColor: bg }]}>
      <Feather name={icon} size={18} color={color} />
    </View>
    <Text style={styles.metricTitle}>{title}</Text>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricSub}>{sub}</Text>
  </View>
);

const SpeedButton = ({
  label,
  subLabel,
  active,
  onPress,
}: {
  label: string;
  subLabel: string;
  active?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.speedButton,
      active && styles.speedButtonActive,
      pressed && { opacity: 0.85 },
    ]}
  >
    <Text style={[styles.speedButtonText, active && styles.speedButtonTextActive]}>
      {label}
    </Text>
    <Text
      style={[styles.speedButtonSubText, active && styles.speedButtonSubTextActive]}
    >
      {subLabel}
    </Text>
  </Pressable>
);

const AdjustButton = ({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.adjustButton,
      disabled && styles.adjustButtonDisabled,
      pressed && !disabled && { opacity: 0.85 },
    ]}
  >
    <Text
      style={[styles.adjustButtonText, disabled && styles.adjustButtonTextDisabled]}
    >
      {label}
    </Text>
  </Pressable>
);

export default function Monitoring() {
  const [statusData, setStatusData] = useState<DeviceStatus | null>(null);
  const [controlData, setControlData] = useState<ControlState | null>(null);
  const [settingsData, setSettingsData] = useState<DeviceSettings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [rtcSyncState, setRtcSyncState] = useState<RtcSyncState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyToggle, setBusyToggle] = useState(false);
  const [busySpeed, setBusySpeed] = useState(false);
  const [busyRtcSync, setBusyRtcSync] = useState(false);
  const [busyBinThreshold, setBusyBinThreshold] = useState(false);

  useEffect(() => {
    const statusRef = ref(db, `/devices/${DEVICE_ID}/status`);
    const controlRef = ref(db, `/devices/${DEVICE_ID}/control`);
    const settingsRef = ref(db, `/devices/${DEVICE_ID}/settings`);
    const historyRef = ref(db, `/devices/${DEVICE_ID}/history`);
    const rtcSyncRef = ref(db, `/devices/${DEVICE_ID}/control/rtcSync`);

    const unsubStatus = onValue(
      statusRef,
      (snapshot) => {
        setStatusData(snapshot.val());
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    const unsubControl = onValue(controlRef, (snapshot) => {
      setControlData(snapshot.val());
    });

    const unsubSettings = onValue(settingsRef, (snapshot) => {
      setSettingsData(snapshot.val());
    });

    const unsubHistory = onValue(historyRef, (snapshot) => {
      setHistory(mapHistory(snapshot.val()));
    });

    const unsubRtcSync = onValue(rtcSyncRef, (snapshot) => {
      setRtcSyncState(snapshot.val());
    });

    return () => {
      unsubStatus();
      unsubControl();
      unsubSettings();
      unsubHistory();
      unsubRtcSync();
    };
  }, []);

  const isOnline = !!statusData?.wifiConnected;
  const conveyorOn = !!statusData?.conveyor?.isOn;
  const autoRunning = !!statusData?.auto?.running;
  const manualRun = !!controlData?.manualRun;
  const manualPwm = Number(controlData?.manualPwm ?? 180);
  const activeAutoPwm = Number(statusData?.auto?.pwm ?? manualPwm);
  const rawWeight = Number(statusData?.loadCell?.raw ?? 0);
  const weightGrams = Number(statusData?.loadCell?.weightGrams ?? 0);
  const weightKg = Number(statusData?.loadCell?.weightKg ?? 0);
  const loadPresent = !!statusData?.loadCell?.loadPresent;
  const binFull = !!statusData?.loadCell?.binFull;
  const servoOpened = !!statusData?.servo?.opened;
  const distanceCm = Number(statusData?.ultrasonic?.distanceCm ?? 0);
  const rtcTime = statusData?.rtc?.dateTime ?? "--";
  const updatedAtMs = Number(statusData?.updatedAtMs ?? 0);
  const activeScheduleId = statusData?.auto?.activeScheduleId || "--";
  const binFullThresholdGrams = clampBinThreshold(
    Number(
      settingsData?.binFullThresholdGrams ??
        statusData?.settings?.binFullThresholdGrams ??
        500
    )
  );

  const rtcSyncPending = !!rtcSyncState?.syncRtc;
  const rtcLastRequested = rtcSyncState?.requestedAt;

  const systemLabel = useMemo(() => {
    if (loading) return "Loading";
    if (!isOnline) return "Offline";
    if (manualRun && conveyorOn) return "Manual Running";
    if (autoRunning && conveyorOn) return "Auto Running";
    if (binFull) return "Bin Full";
    if (loadPresent) return "Load Detected";
    return "Idle";
  }, [loading, isOnline, manualRun, autoRunning, conveyorOn, loadPresent, binFull]);

  const systemColor = useMemo(() => {
    if (loading) return "#64748b";
    if (!isOnline) return "#ef4444";
    if (manualRun && conveyorOn) return "#2563eb";
    if (autoRunning && conveyorOn) return "#8b5cf6";
    if (binFull) return "#ef4444";
    if (loadPresent) return "#f59e0b";
    return "#16a34a";
  }, [loading, isOnline, manualRun, autoRunning, conveyorOn, loadPresent, binFull]);

  const fillPct =
    binFullThresholdGrams > 0
      ? Math.max(0, Math.min(100, Math.round((weightGrams / binFullThresholdGrams) * 100)))
      : 0;
  const pwmPct = manualPwm / PWM_MAX;

  const updateControl = async (patch: Partial<ControlState>) => {
    await update(ref(db, `/devices/${DEVICE_ID}/control`), patch);
  };

  const handleManualToggle = async (value: boolean) => {
    try {
      setBusyToggle(true);
      await updateControl({ manualRun: value });
    } catch (error: any) {
      Alert.alert("Update failed", error?.message ?? "Could not update manual switch.");
    } finally {
      setBusyToggle(false);
    }
  };

  const handleSpeedChange = async (pwm: number) => {
    try {
      setBusySpeed(true);
      await updateControl({ manualPwm: clampPwm(pwm) });
    } catch (error: any) {
      Alert.alert("Update failed", error?.message ?? "Could not update speed.");
    } finally {
      setBusySpeed(false);
    }
  };

  const handleSpeedAdjust = async (delta: number) => {
    await handleSpeedChange(manualPwm + delta);
  };

  const handleBinThresholdChange = async (grams: number) => {
    try {
      setBusyBinThreshold(true);
      await update(ref(db, `/devices/${DEVICE_ID}/settings`), {
        binFullThresholdGrams: clampBinThreshold(grams),
      });
    } catch (error: any) {
      Alert.alert(
        "Update failed",
        error?.message ?? "Could not update bin full threshold."
      );
    } finally {
      setBusyBinThreshold(false);
    }
  };

  const handleBinThresholdAdjust = async (delta: number) => {
    await handleBinThresholdChange(binFullThresholdGrams + delta);
  };

  const handleRtcSync = async () => {
    if (!isOnline) {
      Alert.alert("Device offline", "The ESP32 must be online before syncing RTC.");
      return;
    }

    try {
      setBusyRtcSync(true);

      const now = new Date();

      await update(ref(db, `/devices/${DEVICE_ID}/control/rtcSync`), {
        syncRtc: true,
        year: Number(String(now.getFullYear()).slice(-2)),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
        second: now.getSeconds(),
        requestedAt: Date.now(),
      });

      Alert.alert("RTC sync requested", "The app sent the current time to the ESP32.");
    } catch (error: any) {
      Alert.alert("Sync failed", error?.message ?? "Could not send RTC sync request.");
    } finally {
      setBusyRtcSync(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Monitoring</Text>
          <Text style={styles.pageSubtitle}>
            Live conveyor data, bin threshold, manual controls, RTC sync, and activity
          </Text>
        </View>

        {loading ? (
          <Card>
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loadingText}>Loading realtime data...</Text>
            </View>
          </Card>
        ) : (
          <>
            <View
              style={[
                styles.statusBanner,
                {
                  backgroundColor: `${systemColor}14`,
                  borderColor: `${systemColor}30`,
                },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: systemColor }]} />
              <Text style={[styles.statusBannerText, { color: systemColor }]}>
                {systemLabel}
              </Text>
            </View>

            <Card>
              <Text style={styles.sectionTitle}>Overview</Text>

              <View style={styles.metricGrid}>
                <MetricCard
                  title="Connection"
                  value={isOnline ? "Online" : "Offline"}
                  sub="ESP32 Wi-Fi status"
                  icon="wifi"
                  color={isOnline ? "#16a34a" : "#ef4444"}
                  bg={isOnline ? "#dcfce7" : "#fee2e2"}
                />
                <MetricCard
                  title="Conveyor"
                  value={conveyorOn ? "Running" : "Stopped"}
                  sub={manualRun ? "Manual control" : autoRunning ? "Auto schedule" : "Idle"}
                  icon="activity"
                  color={conveyorOn ? "#2563eb" : "#64748b"}
                  bg={conveyorOn ? "#dbeafe" : "#e2e8f0"}
                />
                <MetricCard
                  title="Weight"
                  value={formatWeightLabel(weightGrams)}
                  sub={`${weightKg.toFixed(3)} kg calibrated`}
                  icon="package"
                  color="#f59e0b"
                  bg="#fef3c7"
                />
                <MetricCard
                  title="Servo Bin"
                  value={servoOpened ? "Opened" : "Closed"}
                  sub={conveyorOn ? "Following conveyor state" : "Normal position"}
                  icon="box"
                  color={servoOpened ? "#f59e0b" : "#16a34a"}
                  bg={servoOpened ? "#fef3c7" : "#dcfce7"}
                />
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Bin Level</Text>
              <View style={styles.binHeader}>
                <Text style={styles.binLabel}>Current fill estimate</Text>
                <Text
                  style={[
                    styles.binValue,
                    {
                      color:
                        fillPct >= 80 ? "#ef4444" : fillPct >= 50 ? "#f59e0b" : "#16a34a",
                    },
                  ]}
                >
                  {fillPct}%
                </Text>
              </View>

              <Progress.Bar
                progress={fillPct / 100}
                width={null}
                height={14}
                color={fillPct >= 80 ? "#ef4444" : fillPct >= 50 ? "#f59e0b" : "#16a34a"}
                borderRadius={10}
                unfilledColor="#e5e7eb"
                borderWidth={0}
              />

              <Text style={styles.binSubText}>
                {binFull
                  ? `Bin full triggered at ${formatWeightLabel(binFullThresholdGrams)}.`
                  : loadPresent
                  ? `Current load: ${formatWeightLabel(weightGrams)}. Full threshold: ${formatWeightLabel(
                      binFullThresholdGrams
                    )}.`
                  : `No load currently detected. Full threshold: ${formatWeightLabel(
                      binFullThresholdGrams
                    )}.`}
              </Text>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Bin Full Threshold</Text>

              <View style={styles.controlBox}>
                <View style={styles.controlTopRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.controlTitle}>Maximum Bin Weight</Text>
                    <Text style={styles.controlSub}>
                      Choose the weight where the system should mark the bin as full.
                    </Text>
                  </View>
                </View>

                <View style={styles.manualInfoRow}>
                  <View style={styles.manualInfoChip}>
                    <Text style={styles.manualInfoChipText}>
                      Current: {formatWeightLabel(binFullThresholdGrams)}
                    </Text>
                  </View>
                  <View style={styles.manualInfoChip}>
                    <Text style={styles.manualInfoChipText}>Default: 500 g</Text>
                  </View>
                  <View style={styles.manualInfoChip}>
                    <Text style={styles.manualInfoChipText}>Max: 10 kg</Text>
                  </View>
                </View>

                <Text style={styles.speedLabel}>Quick Presets</Text>

                <View style={styles.speedRow}>
                  <SpeedButton
                    label="500 g"
                    subLabel="default"
                    active={binFullThresholdGrams === 500}
                    onPress={() => handleBinThresholdChange(500)}
                  />
                  <SpeedButton
                    label="1 kg"
                    subLabel="standard"
                    active={binFullThresholdGrams === 1000}
                    onPress={() => handleBinThresholdChange(1000)}
                  />
                  <SpeedButton
                    label="2 kg"
                    subLabel="higher"
                    active={binFullThresholdGrams === 2000}
                    onPress={() => handleBinThresholdChange(2000)}
                  />
                </View>

                <View style={[styles.speedRow, { marginTop: 10 }]}>
                  <SpeedButton
                    label="5 kg"
                    subLabel="large"
                    active={binFullThresholdGrams === 5000}
                    onPress={() => handleBinThresholdChange(5000)}
                  />
                  <SpeedButton
                    label="10 kg"
                    subLabel="maximum"
                    active={binFullThresholdGrams === 10000}
                    onPress={() => handleBinThresholdChange(10000)}
                  />
                  <View style={{ flex: 1 }} />
                </View>

                <Text style={[styles.speedLabel, { marginTop: 14 }]}>Fine Adjust</Text>

                <View style={styles.adjustRow}>
                  <AdjustButton
                    label="-500 g"
                    onPress={() => handleBinThresholdAdjust(-500)}
                    disabled={busyBinThreshold || !isOnline}
                  />
                  <AdjustButton
                    label="-100 g"
                    onPress={() => handleBinThresholdAdjust(-100)}
                    disabled={busyBinThreshold || !isOnline}
                  />
                  <AdjustButton
                    label="+100 g"
                    onPress={() => handleBinThresholdAdjust(100)}
                    disabled={busyBinThreshold || !isOnline}
                  />
                  <AdjustButton
                    label="+500 g"
                    onPress={() => handleBinThresholdAdjust(500)}
                    disabled={busyBinThreshold || !isOnline}
                  />
                </View>

                <Progress.Bar
                  progress={(binFullThresholdGrams - BIN_MIN_G) / (BIN_MAX_G - BIN_MIN_G)}
                  width={null}
                  height={12}
                  color="#16a34a"
                  borderRadius={10}
                  unfilledColor="#e5e7eb"
                  borderWidth={0}
                />

                <View style={styles.pwmScaleRow}>
                  <Text style={styles.pwmScaleText}>500 g</Text>
                  <Text style={styles.pwmScaleText}>
                    {formatWeightLabel(binFullThresholdGrams)}
                  </Text>
                  <Text style={styles.pwmScaleText}>10 kg</Text>
                </View>

                {busyBinThreshold ? (
                  <Text style={styles.smallHint}>Updating bin full threshold...</Text>
                ) : (
                  <Text style={styles.smallHint}>
                    This threshold is used by the ESP32 to decide when the bin is full.
                  </Text>
                )}
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Conveyor Power Control</Text>

              <View style={styles.controlBox}>
                <View style={styles.controlTopRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.controlTitle}>Manual Switch</Text>
                    <Text style={styles.controlSub}>
                      Turn this on to directly control the conveyor from the app.
                    </Text>
                  </View>

                  <Switch
                    value={manualRun}
                    onValueChange={handleManualToggle}
                    disabled={busyToggle || !isOnline}
                    trackColor={{ false: "#cbd5e1", true: "#93c5fd" }}
                    thumbColor={manualRun ? "#2563eb" : "#ffffff"}
                  />
                </View>

                <View style={styles.manualInfoRow}>
                  <View style={styles.manualInfoChip}>
                    <Text style={styles.manualInfoChipText}>
                      Mode: {manualRun ? "MANUAL" : "AUTO"}
                    </Text>
                  </View>
                  <View style={styles.manualInfoChip}>
                    <Text style={styles.manualInfoChipText}>PWM: {manualPwm}</Text>
                  </View>
                  <View style={styles.manualInfoChip}>
                    <Text style={styles.manualInfoChipText}>
                      Profile: {getPwmPresetLabel(manualPwm)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.speedLabel}>Conveyor Strength</Text>

                <Progress.Bar
                  progress={pwmPct}
                  width={null}
                  height={12}
                  color="#2563eb"
                  borderRadius={10}
                  unfilledColor="#e5e7eb"
                  borderWidth={0}
                />

                <View style={styles.pwmScaleRow}>
                  <Text style={styles.pwmScaleText}>{PWM_MIN}</Text>
                  <Text style={styles.pwmScaleText}>
                    {manualPwm} • {Math.round(pwmPct * 100)}%
                  </Text>
                  <Text style={styles.pwmScaleText}>{PWM_MAX}</Text>
                </View>

                <View style={styles.adjustRow}>
                  <AdjustButton
                    label="-25"
                    onPress={() => handleSpeedAdjust(-25)}
                    disabled={busySpeed || !isOnline}
                  />
                  <AdjustButton
                    label="-10"
                    onPress={() => handleSpeedAdjust(-10)}
                    disabled={busySpeed || !isOnline}
                  />
                  <AdjustButton
                    label="+10"
                    onPress={() => handleSpeedAdjust(10)}
                    disabled={busySpeed || !isOnline}
                  />
                  <AdjustButton
                    label="+25"
                    onPress={() => handleSpeedAdjust(25)}
                    disabled={busySpeed || !isOnline}
                  />
                </View>

                <View style={styles.speedRow}>
                  <SpeedButton
                    label="Gentle"
                    subLabel="lighter spin"
                    active={manualPwm === 120}
                    onPress={() => handleSpeedChange(120)}
                  />
                  <SpeedButton
                    label="Normal"
                    subLabel="balanced"
                    active={manualPwm === 180}
                    onPress={() => handleSpeedChange(180)}
                  />
                  <SpeedButton
                    label="Strong"
                    subLabel="max power"
                    active={manualPwm === 255}
                    onPress={() => handleSpeedChange(255)}
                  />
                </View>

                <Text style={styles.smallHint}>
                  This power setting is shared by both manual mode and scheduled runs.
                </Text>

                {busySpeed ? (
                  <Text style={styles.smallHint}>Updating conveyor strength...</Text>
                ) : null}
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>RTC Sync</Text>

              <View style={styles.controlBox}>
                <View style={styles.controlTopRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.controlTitle}>Device Clock Sync</Text>
                    <Text style={styles.controlSub}>
                      Send your phone&apos;s current time to the ESP32 and DS1302 RTC.
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleRtcSync}
                    disabled={busyRtcSync || !isOnline}
                    style={[
                      styles.syncButton,
                      (!isOnline || busyRtcSync) && styles.syncButtonDisabled,
                    ]}
                  >
                    {busyRtcSync ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Feather name="clock" size={16} color="#fff" />
                        <Text style={styles.syncButtonText}>Sync</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.manualInfoRow}>
                  <View style={styles.manualInfoChip}>
                    <Text style={styles.manualInfoChipText}>RTC: {rtcTime}</Text>
                  </View>
                  <View style={styles.manualInfoChip}>
                    <Text style={styles.manualInfoChipText}>
                      Updated: {formatUpdatedAge(updatedAtMs)}
                    </Text>
                  </View>
                </View>

                <View style={styles.rtcStatusBox}>
                  <View style={styles.rtcStatusRow}>
                    <Text style={styles.rtcStatusLabel}>Sync status</Text>
                    <Text
                      style={[
                        styles.rtcStatusValue,
                        {
                          color: busyRtcSync
                            ? "#2563eb"
                            : rtcSyncPending
                            ? "#d97706"
                            : "#16a34a",
                        },
                      ]}
                    >
                      {busyRtcSync
                        ? "Syncing..."
                        : rtcSyncPending
                        ? "Pending on device"
                        : "Ready"}
                    </Text>
                  </View>

                  <View style={styles.rtcStatusRow}>
                    <Text style={styles.rtcStatusLabel}>Last requested</Text>
                    <Text style={styles.rtcStatusValue}>
                      {formatTimestamp(rtcLastRequested)}
                    </Text>
                  </View>

                  <View style={[styles.rtcStatusRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.rtcStatusLabel}>Device RTC</Text>
                    <Text style={styles.rtcStatusValue}>{rtcTime}</Text>
                  </View>
                </View>

                <Text style={styles.smallHint}>
                  After you press Sync, the ESP32 should read `/control/rtcSync`, set the RTC,
                  then change `syncRtc` back to false.
                </Text>
              </View>
            </Card>

            <Card>
              <Text style={styles.sectionTitle}>Live Device Details</Text>

              <View style={styles.detailList}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>System</Text>
                  <Text style={[styles.detailValue, { color: systemColor }]}>
                    {systemLabel}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>RTC Time</Text>
                  <Text style={styles.detailValue}>{rtcTime}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Raw Reading</Text>
                  <Text style={styles.detailValue}>{rawWeight}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Weight</Text>
                  <Text style={styles.detailValue}>
                    {weightGrams.toFixed(2)} g ({weightKg.toFixed(3)} kg)
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Bin Full Threshold</Text>
                  <Text style={styles.detailValue}>
                    {formatWeightLabel(binFullThresholdGrams)}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Manual Run</Text>
                  <Text style={styles.detailValue}>{manualRun ? "ON" : "OFF"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Power Setting</Text>
                  <Text style={styles.detailValue}>
                    {manualPwm} ({getPwmPresetLabel(manualPwm)})
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Auto Running</Text>
                  <Text style={styles.detailValue}>{autoRunning ? "YES" : "NO"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Auto PWM</Text>
                  <Text style={styles.detailValue}>{activeAutoPwm}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Active Schedule</Text>
                  <Text style={styles.detailValue}>{activeScheduleId}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Bin Full</Text>
                  <Text style={styles.detailValue}>{binFull ? "YES" : "NO"}</Text>
                </View>
                <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.detailLabel}>Last Updated</Text>
                  <Text style={styles.detailValue}>{formatUpdatedAge(updatedAtMs)}</Text>
                </View>
              </View>
            </Card>

            <Card>
              <View style={styles.historyHeader}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                <MaterialCommunityIcons name="history" size={20} color="#64748b" />
              </View>

              {history.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Ionicons name="document-text-outline" size={22} color="#94a3b8" />
                  <Text style={styles.emptyText}>No history yet.</Text>
                </View>
              ) : (
                history.slice(0, 10).map((item) => (
                  <View key={item.id} style={styles.historyRow}>
                    <View style={styles.historyLeft}>
                      <View
                        style={[
                          styles.historyIcon,
                          {
                            backgroundColor:
                              item.status === "EXECUTED"
                                ? "#dcfce7"
                                : item.status === "FAILED"
                                ? "#fee2e2"
                                : "#fef3c7",
                          },
                        ]}
                      >
                        <Feather
                          name={
                            item.status === "EXECUTED"
                              ? "check"
                              : item.status === "FAILED"
                              ? "x"
                              : "clock"
                          }
                          size={14}
                          color={
                            item.status === "EXECUTED"
                              ? "#16a34a"
                              : item.status === "FAILED"
                              ? "#dc2626"
                              : "#d97706"
                          }
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitle}>
                          {item.title || "Schedule event"}
                        </Text>
                        <Text style={styles.historySub}>
                          {item.date || "--"} • {formatTo12Hour(item.hour, item.minute)} •{" "}
                          {item.status || "--"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.historyBadge}>{item.duration || "--"} min</Text>
                  </View>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#0f172a",
  },
  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: "#64748b",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: 20,
  },
  loadingText: {
    marginTop: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 10,
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 14,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  metricCard: {
    width: "48.5%",
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },
  metricIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  metricTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  metricValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  metricSub: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#94a3b8",
  },
  binHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    alignItems: "center",
  },
  binLabel: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "700",
  },
  binValue: {
    fontSize: 15,
    fontWeight: "900",
  },
  binSubText: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748b",
  },
  controlBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  controlTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  controlTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  controlSub: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748b",
  },
  manualInfoRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  manualInfoChip: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  manualInfoChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  speedLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  pwmScaleRow: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pwmScaleText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  adjustRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  adjustButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  adjustButtonDisabled: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
  },
  adjustButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2563eb",
  },
  adjustButtonTextDisabled: {
    color: "#94a3b8",
  },
  speedRow: {
    flexDirection: "row",
    gap: 10,
  },
  speedButton: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  speedButtonActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
  },
  speedButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
  },
  speedButtonTextActive: {
    color: "#ffffff",
  },
  speedButtonSubText: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "600",
    color: "#64748b",
  },
  speedButtonSubTextActive: {
    color: "#cbd5e1",
  },
  smallHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 18,
  },
  syncButton: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  syncButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  syncButtonText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
  },
  rtcStatusBox: {
    marginTop: 6,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  rtcStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rtcStatusLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
  },
  rtcStatusValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
    maxWidth: "55%",
    textAlign: "right",
  },
  detailList: {
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  detailLabel: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "700",
  },
  detailValue: {
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "800",
    maxWidth: "55%",
    textAlign: "right",
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  historyLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  historySub: {
    marginTop: 3,
    fontSize: 12,
    color: "#64748b",
  },
  historyBadge: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    gap: 8,
  },
  emptyText: {
    color: "#94a3b8",
    fontWeight: "600",
  },
});