import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";

import BleStatusIndicator from "@/providers/ble/BleStatusIndicator";
import { useBleCommands } from "@/providers/ble/useBleCommands";

// ── Shared components ─────────────────────────────────────────

const GlassCard = ({ children, style }: any) => (
  <View
    style={[
      {
        backgroundColor: "rgba(30, 41, 59, 0.7)",
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.05)",
        marginBottom: 16,
      },
      style,
    ]}
  >
    {children}
  </View>
);

const ActionButton = ({
  title,
  icon,
  onPress,
  disabled,
  variant = "primary",
}: {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "success";
}) => {
  const backgroundColor =
    variant === "danger"   ? "#ef4444" :
    variant === "success"  ? "#22c55e" :
    variant === "secondary"? "#1e293b" :
    "#3b82f6";

  const borderColor = variant === "secondary" ? "#334155" : "transparent";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor,
        opacity: disabled || pressed ? 0.6 : 1,
      })}
    >
      <Feather name={icon} size={16} color="white" />
      <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>
        {title}
      </Text>
    </Pressable>
  );
};

// ── Status row helper ─────────────────────────────────────────
const StatusRow = ({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
    <Text style={{ color: "#94a3b8", fontSize: 13 }}>{label}</Text>
    <Text style={{ color: valueColor ?? "#f8fafc", fontWeight: "700", maxWidth: "55%", textAlign: "right" }}>
      {value}
    </Text>
  </View>
);

// ── Bin level bar ─────────────────────────────────────────────
const BinLevelBar = ({ pct }: { pct: number }) => {
  const clamped  = Math.min(100, Math.max(0, pct));
  const barColor = clamped >= 80 ? "#ef4444" : clamped >= 50 ? "#f59e0b" : "#22c55e";
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: "#94a3b8", fontSize: 12 }}>Fill level</Text>
        <Text style={{ color: barColor, fontWeight: "800", fontSize: 13 }}>
          {Math.round(clamped)}%
        </Text>
      </View>
      <View
        style={{
          height: 10,
          backgroundColor: "rgba(255,255,255,0.08)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${clamped}%`,
            height: "100%",
            backgroundColor: barColor,
            borderRadius: 6,
          }}
        />
      </View>
      {clamped >= 80 && (
        <Text style={{ color: "#f87171", fontSize: 11, fontWeight: "700", marginTop: 5 }}>
          ⚠ Bin is full — please empty soon
        </Text>
      )}
    </View>
  );
};

// ── Helpers ───────────────────────────────────────────────────
function getSystemColor(isConnected: boolean) {
  return isConnected ? "#22c55e" : "#ef4444";
}

function getSystemLabel(
  isConnected: boolean,
  bleReady: boolean,
  isScanning: boolean
) {
  if (!bleReady)   return "BLUETOOTH OFF";
  if (isScanning)  return "SCANNING";
  return isConnected ? "OPERATIONAL" : "DISCONNECTED";
}

// ── Screen ────────────────────────────────────────────────────
export default function Dashboard() {
  const { width, fontScale } = useWindowDimensions();

  const {
    bleReady,
    isScanning,
    isConnected,
    status,
    mode,
    weight,
    weightPct,    // NEW — bin fill 0–100
    motorDir,     // NEW — 'FWD' | 'REV'
    motorSpeed,   // NEW — 0–255
    rtcTime,      // NEW — "YYYY-MM-DD HH:mm:ss"
    lastEvent,
    binFullAlert,
    scanAndConnect,
    disconnect,
    startConveyor,
    stopConveyor,
    motorFwd,     // NEW — replaces setAutoMode
    motorRev,     // NEW — replaces requestWeight
    syncDeviceTimeNow,
    // Removed: setAutoMode (not in new firmware)
    // Removed: requestWeight (weight is pushed automatically every 5 s)
  } = useBleCommands();

  const numericWeight = Number(weight || 0);

  // Chart points: simulated historical fill curve ending at current weight
  const wasteLevelPoints = [
    0,
    Math.max(0, numericWeight * 0.35),
    Math.max(0, numericWeight * 0.7),
    numericWeight || 0,
  ];

  const systemColor = getSystemColor(isConnected);
  const systemLabel = getSystemLabel(isConnected, bleReady, isScanning);

  // ── Handlers ───────────────────────────────────────────────
  const handleConnect = async () => {
    try {
      await scanAndConnect();
    } catch (e: any) {
      Alert.alert("Connection Failed", e?.message ?? "Could not connect to ESP32.");
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (e: any) {
      Alert.alert("Disconnect Failed", e?.message ?? "Could not disconnect.");
    }
  };

  const handleStart = async () => {
    try {
      await startConveyor();
    } catch (e: any) {
      Alert.alert("Start Failed", e?.message ?? "Failed to start conveyor.");
    }
  };

  const handleStop = async () => {
    try {
      await stopConveyor();
    } catch (e: any) {
      Alert.alert("Stop Failed", e?.message ?? "Failed to stop conveyor.");
    }
  };

  // Replaces handleAuto — sets motor direction to forward
  const handleFwd = async () => {
    try {
      await motorFwd();
    } catch (e: any) {
      Alert.alert("Direction Failed", e?.message ?? "Failed to set forward.");
    }
  };

  // Replaces handleRefreshWeight — sets motor direction to reverse
  // (weight is now pushed automatically every 5 s; no manual refresh needed)
  const handleRev = async () => {
    try {
      await motorRev();
    } catch (e: any) {
      Alert.alert("Direction Failed", e?.message ?? "Failed to set reverse.");
    }
  };

  const handleSyncTime = async () => {
    try {
      await syncDeviceTimeNow();
      Alert.alert("Success", "Device time synced.");
    } catch (e: any) {
      Alert.alert("Time Sync Failed", e?.message ?? "Failed to sync device time.");
    }
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      >
        {/* ── Header ──────────────────────────────────── */}
        <View
          style={{
            marginTop: 20,
            marginBottom: 24,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View>
            <Text
              style={{ fontSize: 28 * fontScale, fontWeight: "800", color: "#f8fafc" }}
            >
              Dashboard
            </Text>
            <Text
              style={{ fontSize: 14 * fontScale, color: "#94a3b8", marginTop: 4 }}
            >
              Smart Chicken Waste Cleaning System
            </Text>
          </View>
          <BleStatusIndicator />
        </View>

        {/* ── System status pill ──────────────────────── */}
        <View
          style={{
            flexDirection: "row",
            backgroundColor: isConnected
              ? "rgba(34, 197, 94, 0.1)"
              : "rgba(239, 68, 68, 0.1)",
            padding: 12,
            borderRadius: 16,
            alignItems: "center",
            marginBottom: 20,
            borderWidth: 1,
            borderColor: isConnected
              ? "rgba(34, 197, 94, 0.2)"
              : "rgba(239, 68, 68, 0.2)",
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: systemColor,
              marginRight: 10,
            }}
          />
          <Text
            style={{
              color: isConnected ? "#4ade80" : "#f87171",
              fontWeight: "600",
              fontSize: 13,
            }}
          >
            SYSTEM {systemLabel}
          </Text>
        </View>

        {/* ── Device Status card ──────────────────────── */}
        <GlassCard>
          <Text
            style={{ color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 16 }}
          >
            DEVICE STATUS
          </Text>

          <View style={{ gap: 14 }}>
            <StatusRow label="BLE Ready"  value={String(bleReady)} />
            <StatusRow label="Connected"  value={String(isConnected)} />
            <StatusRow label="Scanning"   value={String(isScanning)} />
            <StatusRow
              label="Conveyor"
              value={status || "--"}
              valueColor={status === "RUNNING" ? "#4ade80" : "#94a3b8"}
            />
            <StatusRow
              label="Mode"
              value={mode || "--"}
              valueColor={mode === "AUTO" ? "#c084fc" : undefined}
            />
            {/* ── NEW fields ── */}
            <StatusRow
              label="Direction"
              value={isConnected && status === "RUNNING" ? motorDir : "--"}
            />
            <StatusRow
              label="Speed"
              value={isConnected && status === "RUNNING" ? String(motorSpeed) : "--"}
            />
            <StatusRow
              label="Device Clock"
              value={isConnected && rtcTime ? rtcTime : "--"}
              valueColor="#64748b"
            />
          </View>
        </GlassCard>

        {/* ── Waste Bin Level card ─────────────────────── */}
        <GlassCard>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text style={{ color: "#cbd5e1", fontSize: 14, fontWeight: "600" }}>
              WASTE BIN LEVEL
            </Text>
            <Text style={{ color: "#3b82f6", fontWeight: "700" }}>
              {numericWeight.toFixed(1)} g
            </Text>
          </View>

          {/* Fill bar (new) */}
          <BinLevelBar pct={weightPct} />

          {/* Historical trend chart */}
          <Text
            style={{
              color: "#475569",
              fontSize: 11,
              fontWeight: "600",
              marginTop: 16,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Weight trend
          </Text>
          <LineChart
            data={{
              labels: ["25%", "50%", "75%", "Now"],
              datasets: [
                {
                  data: wasteLevelPoints,
                  color: (o = 1) => `rgba(59, 130, 246, ${o})`,
                  strokeWidth: 3,
                },
              ],
            }}
            width={width - 80}
            height={160}
            chartConfig={{
              backgroundGradientFrom: "#1e293b",
              backgroundGradientTo: "#1e293b",
              decimalPlaces: 0,
              color: (o = 1) => `rgba(255, 255, 255, ${o})`,
              labelColor: (o = 1) => `rgba(148, 163, 184, ${o})`,
              style: { borderRadius: 16 },
              propsForDots: { r: "4", strokeWidth: "2", stroke: "#3b82f6" },
            }}
            bezier
            style={{ marginVertical: 8, borderRadius: 16, marginLeft: -20 }}
          />
        </GlassCard>

        {/* ── Controls card ────────────────────────────── */}
        <GlassCard>
          <Text
            style={{ color: "#cbd5e1", fontSize: 14, fontWeight: "600", marginBottom: 16 }}
          >
            CONTROLS
          </Text>

          <View style={{ gap: 12 }}>
            {/* Row 1 — Connection */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title={isScanning ? "Scanning..." : "Connect"}
                  icon="bluetooth"
                  onPress={handleConnect}
                  disabled={!bleReady || isConnected || isScanning}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Disconnect"
                  icon="x-circle"
                  onPress={handleDisconnect}
                  disabled={!isConnected}
                  variant="secondary"
                />
              </View>
            </View>

            {/* Row 2 — Motor on/off */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Start"
                  icon="play"
                  onPress={handleStart}
                  disabled={!isConnected}
                  variant="success"
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Stop"
                  icon="square"
                  onPress={handleStop}
                  disabled={!isConnected}
                  variant="danger"
                />
              </View>
            </View>

            {/* Row 3 — Direction (replaces Auto Mode + Refresh Weight) */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Forward"
                  icon="arrow-right"
                  onPress={handleFwd}
                  disabled={!isConnected}
                  variant={
                    isConnected && motorDir === "FWD" && status === "RUNNING"
                      ? "primary"
                      : "secondary"
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Reverse"
                  icon="arrow-left"
                  onPress={handleRev}
                  disabled={!isConnected}
                  variant={
                    isConnected && motorDir === "REV" && status === "RUNNING"
                      ? "primary"
                      : "secondary"
                  }
                />
              </View>
            </View>

            {/* Row 4 — Sync time (full width) */}
            <ActionButton
              title="Sync Device Time"
              icon="clock"
              onPress={handleSyncTime}
              disabled={!isConnected}
              variant="secondary"
            />
          </View>
        </GlassCard>

        {/* ── Recent Activity ──────────────────────────── */}
        <Text
          style={{
            color: "#f8fafc",
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 12,
            marginTop: 8,
          }}
        >
          Recent Activity
        </Text>

        <GlassCard style={{ marginTop: 6 }}>
          {binFullAlert ? (
            <View
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                borderRadius: 16,
                padding: 14,
                marginBottom: 14,
                borderWidth: 1,
                borderColor: "rgba(239, 68, 68, 0.2)",
              }}
            >
              <Text
                style={{ color: "#f87171", fontWeight: "800", marginBottom: 4 }}
              >
                BIN ALERT
              </Text>
              <Text style={{ color: "#fecaca" }}>{binFullAlert}</Text>
            </View>
          ) : null}

          <View
            style={{
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              borderRadius: 16,
              padding: 14,
              minHeight: 90,
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#cbd5e1",
                fontSize: 13,
                fontWeight: "700",
                marginBottom: 8,
              }}
            >
              LAST EVENT
            </Text>
            <Text
              style={{ color: "#94a3b8", fontSize: 13, lineHeight: 20 }}
              selectable
            >
              {lastEvent || "No recent activity"}
            </Text>
          </View>
        </GlassCard>

        {/* ── Bluetooth waiting indicator ──────────────── */}
        {!bleReady ? (
          <View style={{ marginTop: 8, alignItems: "center" }}>
            <ActivityIndicator color="#3b82f6" />
            <Text style={{ color: "#94a3b8", marginTop: 8 }}>
              Waiting for Bluetooth to power on...
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}