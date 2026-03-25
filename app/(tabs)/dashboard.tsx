import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LineChart, ProgressChart } from "react-native-chart-kit";
import { onValue, ref, update } from "firebase/database";

import { db } from "@/lib/firebase";

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
  auto?: {
    running?: boolean;
    activeScheduleId?: string;
  };
  loadCell?: {
    raw?: number;
    loadPresent?: boolean;
  };
  ultrasonic?: {
    distanceCm?: number;
  };
  rtc?: {
    dateTime?: string;
  };
};

type ControlState = {
  manualRun?: boolean;
  manualPwm?: number;
};

type ScheduleItem = {
  id: string;
  scheduleId?: string;
  title?: string;
  date?: string;
  hour?: string;
  minute?: string;
  duration?: string;
  enabled?: boolean;
  status?: string;
};

type HistoryItem = {
  id: string;
  title?: string;
  date?: string;
  hour?: string;
  minute?: string;
  duration?: string;
  status?: "EXECUTED" | "FAILED" | "SKIPPED" | string;
  executedAt?: number;
  scheduleId?: string;
};

const DEVICE_ID = "conveyorCleaner01";

const Card = ({ children, style }: any) => (
  <View
    style={[
      {
        backgroundColor: "#ffffff",
        borderRadius: 24,
        padding: 18,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "#e2e8f0",
      },
      style,
    ]}
  >
    {children}
  </View>
);

const SectionTitle = ({ title, sub }: { title: string; sub?: string }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={{ fontSize: 18, fontWeight: "800", color: "#0f172a" }}>
      {title}
    </Text>
    {sub ? (
      <Text style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>{sub}</Text>
    ) : null}
  </View>
);

const KpiTile = ({
  label,
  value,
  icon,
  tint,
  bg,
  sub,
}: {
  label: string;
  value: string;
  icon: keyof typeof Feather.glyphMap;
  tint: string;
  bg: string;
  sub?: string;
}) => (
  <View
    style={{
      width: "48.5%",
      backgroundColor: "#f8fafc",
      borderRadius: 20,
      padding: 14,
      borderWidth: 1,
      borderColor: "#e2e8f0",
      marginBottom: 10,
    }}
  >
    <View
      style={{
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
      }}
    >
      <Feather name={icon} size={18} color={tint} />
    </View>

    <Text style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}>{label}</Text>
    <Text
      style={{
        marginTop: 6,
        fontSize: 19,
        fontWeight: "900",
        color: "#0f172a",
      }}
    >
      {value}
    </Text>
    {sub ? (
      <Text style={{ marginTop: 4, fontSize: 12, color: "#94a3b8" }}>{sub}</Text>
    ) : null}
  </View>
);

const DetailRow = ({
  label,
  value,
  valueColor,
  noBorder,
}: {
  label: string;
  value: string;
  valueColor?: string;
  noBorder?: boolean;
}) => (
  <View
    style={{
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 11,
      borderBottomWidth: noBorder ? 0 : 1,
      borderBottomColor: "#f1f5f9",
    }}
  >
    <Text style={{ fontSize: 13, color: "#64748b", fontWeight: "600" }}>{label}</Text>
    <Text
      style={{
        fontSize: 13,
        color: valueColor ?? "#0f172a",
        fontWeight: "800",
        maxWidth: "58%",
        textAlign: "right",
      }}
    >
      {value}
    </Text>
  </View>
);

const SpeedButton = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      flex: 1,
      backgroundColor: active ? "#0f172a" : "#f8fafc",
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: active ? "#0f172a" : "#e2e8f0",
      opacity: pressed ? 0.85 : 1,
    })}
  >
    <Text
      style={{
        fontSize: 13,
        fontWeight: "800",
        color: active ? "#ffffff" : "#334155",
      }}
    >
      {label}
    </Text>
  </Pressable>
);

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

function mapObjectToArray<T extends { id: string }>(
  value: Record<string, Omit<T, "id">> | null | undefined
): T[] {
  if (!value) return [] as T[];

  return Object.entries(value).map(([id, item]) => ({
    id,
    ...(item as Omit<T, "id">),
  })) as T[];
}

export default function Dashboard() {
  const { width, fontScale } = useWindowDimensions();

  const [statusData, setStatusData] = useState<DeviceStatus | null>(null);
  const [controlData, setControlData] = useState<ControlState | null>(null);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyToggle, setBusyToggle] = useState(false);
  const [busySpeed, setBusySpeed] = useState(false);

  useEffect(() => {
    const statusRef = ref(db, `/devices/${DEVICE_ID}/status`);
    const controlRef = ref(db, `/devices/${DEVICE_ID}/control`);
    const scheduleRef = ref(db, `/devices/${DEVICE_ID}/schedule/slots`);
    const historyRef = ref(db, `/devices/${DEVICE_ID}/history`);

    const unsubStatus = onValue(
      statusRef,
      (snapshot) => {
        setStatusData(snapshot.val());
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubControl = onValue(controlRef, (snapshot) => {
      setControlData(snapshot.val());
    });

    const unsubSchedule = onValue(scheduleRef, (snapshot) => {
      const items = mapObjectToArray<ScheduleItem>(snapshot.val());
      setSchedules(items);
    });

    const unsubHistory = onValue(historyRef, (snapshot) => {
      const items = mapObjectToArray<HistoryItem>(snapshot.val()).sort(
        (a, b) => Number(b.executedAt ?? 0) - Number(a.executedAt ?? 0)
      );
      setHistory(items);
    });

    return () => {
      unsubStatus();
      unsubControl();
      unsubSchedule();
      unsubHistory();
    };
  }, []);

  const isOnline = !!statusData?.wifiConnected;
  const conveyorOn = !!statusData?.conveyor?.isOn;
  const autoRunning = !!statusData?.auto?.running;
  const manualRun = !!controlData?.manualRun;
  const manualPwm = Number(controlData?.manualPwm ?? 180);
  const rawWeight = Number(statusData?.loadCell?.raw ?? 0);
  const loadPresent = !!statusData?.loadCell?.loadPresent;
  const distanceCm = Number(statusData?.ultrasonic?.distanceCm ?? 0);
  const rtcTime = statusData?.rtc?.dateTime ?? "--";
  const updatedAtMs = Number(statusData?.updatedAtMs ?? 0);
  const activeScheduleId = statusData?.auto?.activeScheduleId || "--";

  const enabledSchedules = schedules.filter((s) => !!s.enabled);
  const disabledSchedules = schedules.filter((s) => !s.enabled);
  const executedCount = history.filter((h) => h.status === "EXECUTED").length;
  const failedCount = history.filter((h) => h.status === "FAILED").length;
  const skippedCount = history.filter((h) => h.status === "SKIPPED").length;

  const systemLabel = useMemo(() => {
    if (loading) return "Loading";
    if (!isOnline) return "Offline";
    if (manualRun && conveyorOn) return "Manual Running";
    if (autoRunning && conveyorOn) return "Auto Running";
    if (loadPresent) return "Load Detected";
    return "Connected";
  }, [loading, isOnline, manualRun, autoRunning, conveyorOn, loadPresent]);

  const systemColor = useMemo(() => {
    if (loading) return "#64748b";
    if (!isOnline) return "#ef4444";
    if (manualRun && conveyorOn) return "#3b82f6";
    if (autoRunning && conveyorOn) return "#8b5cf6";
    if (loadPresent) return "#f59e0b";
    return "#10b981";
  }, [loading, isOnline, manualRun, autoRunning, conveyorOn, loadPresent]);

  const statusPillBg = `${systemColor}18`;

  const shadowStyle = {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  };

  const updateControl = async (patch: Partial<ControlState>) => {
    await update(ref(db, `/devices/${DEVICE_ID}/control`), patch);
  };

  const handleManualToggle = async (value: boolean) => {
    try {
      setBusyToggle(true);
      await updateControl({ manualRun: value });
    } catch (error: any) {
      Alert.alert("Update failed", error?.message ?? "Could not change manual control.");
    } finally {
      setBusyToggle(false);
    }
  };

  const handleSpeedChange = async (pwm: number) => {
    try {
      setBusySpeed(true);
      await updateControl({ manualPwm: pwm });
    } catch (error: any) {
      Alert.alert("Update failed", error?.message ?? "Could not change speed.");
    } finally {
      setBusySpeed(false);
    }
  };

  const fillPct = loadPresent ? 100 : 0;

  const chartWidth = width - 90;

  const binTrendData = {
    labels: ["0", "25", "50", "75", "Now"],
    datasets: [
      {
        data: [
          Math.max(0, rawWeight * 0.15),
          Math.max(0, rawWeight * 0.35),
          Math.max(0, rawWeight * 0.55),
          Math.max(0, rawWeight * 0.8),
          Math.max(0, rawWeight || 0),
        ],
        strokeWidth: 3,
      },
    ],
  };

  const scheduleDistribution = {
    labels: ["Enabled", "Disabled", "Executed"],
    data: [
      schedules.length > 0 ? enabledSchedules.length / Math.max(1, schedules.length) : 0,
      schedules.length > 0 ? disabledSchedules.length / Math.max(1, schedules.length) : 0,
      history.length > 0 ? Math.min(1, executedCount / Math.max(1, history.length)) : 0,
    ],
  };

  const chartConfig = {
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
    propsForDots: {
      r: "4",
      strokeWidth: "2",
      stroke: "#2563eb",
    },
    propsForBackgroundLines: {
      stroke: "#e2e8f0",
    },
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 36 }}
      >
        <View
          style={{
            marginBottom: 18,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                fontSize: 28 * fontScale,
                fontWeight: "900",
                color: "#0f172a",
              }}
            >
              Dashboard
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 14,
                lineHeight: 20,
                color: "#64748b",
              }}
            >
              Live system overview, charts, schedules, and manual conveyor control.
            </Text>
          </View>

          <View
            style={{
              backgroundColor: statusPillBg,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: `${systemColor}33`,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: systemColor,
                marginRight: 8,
              }}
            />
            <Text style={{ color: systemColor, fontWeight: "800", fontSize: 12 }}>
              {systemLabel}
            </Text>
          </View>
        </View>

        {loading ? (
          <Card style={shadowStyle}>
            <View style={{ alignItems: "center", paddingVertical: 22 }}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={{ marginTop: 12, color: "#64748b", fontWeight: "600" }}>
                Loading device data...
              </Text>
            </View>
          </Card>
        ) : (
          <>
            <Card style={shadowStyle}>
              <SectionTitle
                title="KPI Overview"
                sub="Fast snapshot of your conveyor cleaner"
              />

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                }}
              >
                <KpiTile
                  label="Connection"
                  value={isOnline ? "Online" : "Offline"}
                  icon="wifi"
                  tint={isOnline ? "#10b981" : "#ef4444"}
                  bg={isOnline ? "#dcfce7" : "#fee2e2"}
                  sub={`Updated ${formatUpdatedAge(updatedAtMs)}`}
                />
                <KpiTile
                  label="Conveyor"
                  value={conveyorOn ? "Running" : "Stopped"}
                  icon="activity"
                  tint={conveyorOn ? "#3b82f6" : "#64748b"}
                  bg={conveyorOn ? "#dbeafe" : "#e2e8f0"}
                  sub={manualRun ? "Manual mode" : autoRunning ? "Auto mode" : "Connected"}
                />
                <KpiTile
                  label="Schedules"
                  value={`${enabledSchedules.length}`}
                  icon="calendar"
                  tint="#8b5cf6"
                  bg="#ede9fe"
                  sub={`${disabledSchedules.length} disabled`}
                />
                <KpiTile
                  label="History"
                  value={`${history.length}`}
                  icon="clock"
                  tint="#f59e0b"
                  bg="#fef3c7"
                  sub={`${executedCount} executed`}
                />
              </View>
            </Card>

            <Card style={shadowStyle}>
              <SectionTitle
                title="Bin Monitoring"
                sub="Load-cell trend and current fill estimate"
              />

              <View
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: 20,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 10,
                  }}
                >
                  <View>
                    <Text style={{ fontSize: 12, color: "#64748b", fontWeight: "700" }}>
                      Current raw value
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 22, fontWeight: "900", color: "#0f172a" }}>
                      {rawWeight}
                    </Text>
                  </View>

                  <View
                    style={{
                      alignItems: "flex-end",
                    }}
                  >
                    <Text style={{ fontSize: 12, color: "#64748b", fontWeight: "700" }}>
                      Fill estimate
                    </Text>
                    <Text
                      style={{
                        marginTop: 4,
                        fontSize: 22,
                        fontWeight: "900",
                        color: fillPct >= 80 ? "#ef4444" : fillPct >= 50 ? "#f59e0b" : "#10b981",
                      }}
                    >
                      {fillPct}%
                    </Text>
                  </View>
                </View>

                <LineChart
                  data={binTrendData}
                  width={chartWidth}
                  height={190}
                  chartConfig={chartConfig}
                  bezier
                  withInnerLines
                  withOuterLines={false}
                  withVerticalLines={false}
                  style={{ borderRadius: 16, marginLeft: -12 }}
                />

                <View
                  style={{
                    marginTop: 10,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#64748b" }}>
                    Sensor: {loadPresent ? "Load detected" : "Clear"}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748b" }}>
                    Distance: {distanceCm} cm
                  </Text>
                </View>
              </View>
            </Card>

            <Card style={shadowStyle}>
              <SectionTitle
                title="Schedule & Execution Summary"
                sub="Typical dashboard counters for planning and activity"
              />

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <KpiTile
                  label="Enabled"
                  value={`${enabledSchedules.length}`}
                  icon="check-circle"
                  tint="#10b981"
                  bg="#dcfce7"
                />
                <KpiTile
                  label="Disabled"
                  value={`${disabledSchedules.length}`}
                  icon="slash"
                  tint="#64748b"
                  bg="#e2e8f0"
                />
                <KpiTile
                  label="Executed"
                  value={`${executedCount}`}
                  icon="play-circle"
                  tint="#2563eb"
                  bg="#dbeafe"
                />
                <KpiTile
                  label="Failed"
                  value={`${failedCount}`}
                  icon="alert-circle"
                  tint="#ef4444"
                  bg="#fee2e2"
                />
              </View>

              <View
                style={{
                  marginTop: 8,
                  backgroundColor: "#f8fafc",
                  borderRadius: 20,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                }}
              >
                <Text style={{ marginBottom: 12, fontSize: 13, fontWeight: "800", color: "#334155" }}>
                  Schedule mix
                </Text>

                <ProgressChart
                  data={scheduleDistribution}
                  width={chartWidth}
                  height={190}
                  strokeWidth={16}
                  radius={32}
                  chartConfig={{
                    backgroundGradientFrom: "#ffffff",
                    backgroundGradientTo: "#ffffff",
                    color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(100,116,139, ${opacity})`,
                  }}
                  hideLegend={false}
                  style={{ marginLeft: -14 }}
                />

                <View
                  style={{
                    marginTop: 12,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#64748b" }}>
                    Skipped: {skippedCount}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748b" }}>
                    Total history: {history.length}
                  </Text>
                </View>
              </View>

              
            </Card>

            {/* <Card style={shadowStyle}>
              <SectionTitle
                title="Manual Conveyor Control"
                sub="Directly start or stop the conveyor from the app"
              />

              <View
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: 22,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 14 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: "#0f172a" }}>
                      Manual Switch
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>
                      {manualRun
                        ? "Manual mode is ON. Conveyor follows your switch and speed setting."
                        : "Manual mode is OFF. Auto schedules can control the conveyor."}
                    </Text>
                  </View>

                  <Switch
                    value={manualRun}
                    onValueChange={handleManualToggle}
                    disabled={busyToggle || !isOnline}
                    trackColor={{ false: "#cbd5e1", true: "#93c5fd" }}
                    thumbColor={manualRun ? "#2563eb" : "#f8fafc"}
                  />
                </View>

                {!isOnline ? (
                  <View
                    style={{
                      marginTop: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: "#fee2e2",
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <Ionicons name="warning-outline" size={18} color="#dc2626" />
                    <Text
                      style={{
                        marginLeft: 8,
                        color: "#b91c1c",
                        fontSize: 12,
                        fontWeight: "700",
                        flex: 1,
                      }}
                    >
                      Device is offline. Manual control is temporarily unavailable.
                    </Text>
                  </View>
                ) : null}

                <View style={{ marginTop: 18 }}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "800",
                      color: "#64748b",
                      marginBottom: 10,
                      textTransform: "uppercase",
                    }}
                  >
                    Manual Speed
                  </Text>

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <SpeedButton
                      label="Low"
                      active={manualPwm === 120}
                      onPress={() => handleSpeedChange(120)}
                    />
                    <SpeedButton
                      label="Medium"
                      active={manualPwm === 180}
                      onPress={() => handleSpeedChange(180)}
                    />
                    <SpeedButton
                      label="High"
                      active={manualPwm === 255}
                      onPress={() => handleSpeedChange(255)}
                    />
                  </View>

                  <View
                    style={{
                      marginTop: 12,
                      backgroundColor: "#eff6ff",
                      borderRadius: 14,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: "#dbeafe",
                    }}
                  >
                    <Text style={{ fontSize: 13, color: "#1e3a8a", fontWeight: "700" }}>
                      Current manual PWM: {manualPwm}
                    </Text>
                  </View>

                  {busySpeed ? (
                    <Text style={{ marginTop: 8, color: "#64748b", fontSize: 12 }}>
                      Updating speed...
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card> */}

            {/* <Card style={shadowStyle}>
              <SectionTitle
                title="Device Details"
                sub="Useful live values reported by the ESP32"
              />

              <DetailRow label="System Status" value={systemLabel} valueColor={systemColor} />
              <DetailRow label="RTC Time" value={rtcTime} />
              <DetailRow label="HX711 Raw" value={`${rawWeight}`} />
              <DetailRow label="Manual Run" value={manualRun ? "ON" : "OFF"} />
              <DetailRow label="Auto Running" value={autoRunning ? "YES" : "NO"} />
              <DetailRow label="Active Schedule" value={activeScheduleId} />
              <DetailRow label="Last Updated" value={formatUpdatedAge(updatedAtMs)} noBorder />
            </Card> */}

            <Card style={shadowStyle}>
              <SectionTitle
                title="Live Notes"
                sub="Simple status hints based on your current device values"
              />

              <View
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: 20,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#e2e8f0",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      backgroundColor: "#e2e8f0",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Feather name="info" size={18} color="#334155" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: "#0f172a" }}>
                      Current condition
                    </Text>
                    <Text
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        lineHeight: 20,
                        color: "#64748b",
                      }}
                    >
                      {!isOnline
                        ? "The device is offline. Check the ESP32 power and Wi-Fi connection."
                        : manualRun && conveyorOn
                        ? "Manual mode is currently driving the conveyor."
                        : autoRunning && conveyorOn
                        ? "A saved schedule is currently running the conveyor automatically."
                        : loadPresent
                        ? "The load sensor currently detects weight on the platform."
                        : "The system is online and currently connected."}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>

            <Card style={shadowStyle}>
              <SectionTitle
                title="Recent Activity"
                sub="Latest schedule execution entries"
              />

              {history.length === 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 20,
                  }}
                >
                  <MaterialCommunityIcons name="history" size={24} color="#94a3b8" />
                  <Text style={{ marginTop: 8, color: "#94a3b8", fontWeight: "600" }}>
                    No history yet.
                  </Text>
                </View>
              ) : (
                history.slice(0, 5).map((item, index) => (
                  <View
                    key={item.id}
                    style={{
                      paddingVertical: 12,
                      borderBottomWidth: index === 4 ? 0 : 1,
                      borderBottomColor: "#f1f5f9",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: "#0f172a" }}>
                        {item.title || "Schedule event"}
                      </Text>
                      <Text style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                        {item.date || "--"} • {item.hour || "--"}:{item.minute || "--"} • {item.status || "--"}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 999,
                        backgroundColor:
                          item.status === "EXECUTED"
                            ? "#dcfce7"
                            : item.status === "FAILED"
                            ? "#fee2e2"
                            : "#fef3c7",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "900",
                          color:
                            item.status === "EXECUTED"
                              ? "#166534"
                              : item.status === "FAILED"
                              ? "#b91c1c"
                              : "#a16207",
                        }}
                      >
                        {item.status || "--"}
                      </Text>
                    </View>
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