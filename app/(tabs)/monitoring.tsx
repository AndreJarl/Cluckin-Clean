import { globalStyles } from "@/styles/globalStyle";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import AntDesign  from "@expo/vector-icons/AntDesign";
import Entypo    from "@expo/vector-icons/Entypo";
import Feather   from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import * as Progress from "react-native-progress";

import { useBleCommands } from "@/providers/ble/useBleCommands";

// Bin is "full" at 80 % fill — matches new firmware CHAR_ALERT threshold
const BIN_FULL_PCT = 80;

type HistoryLikeItem = {
  id: string;
  icon: React.ReactNode;
  details: string;
  timeText: string;
};

// ── Icon picker — updated for new firmware alert strings ────────
function getHistoryIcon(message: string) {
  const msg = (message || "").toLowerCase();

  // New firmware alert prefixes
  if (msg.startsWith("bin_full"))  return <Entypo name="warning"       size={14} color="#ef4444" />;
  if (msg.startsWith("sch_start")) return <Feather name="clock"        size={14} color="#8b5cf6" />;
  if (msg.startsWith("sch_saved")) return <Feather name="check-square" size={14} color="#10b981" />;
  if (msg === "motor_done")        return <AntDesign name="check-circle" size={14} color="#16a34a" />;
  if (msg === "rtc_synced")        return <Feather name="clock"        size={14} color="#06b6d4" />;

  // Generic keyword fallbacks
  if (msg.includes("full")  || msg.includes("bin"))       return <Entypo name="warning"      size={14} color="#f59e0b" />;
  if (msg.includes("conveyor") || msg.includes("motor"))  return <FontAwesome name="gear"    size={14} color="#2563eb" />;
  if (msg.includes("schedule"))                           return <Feather name="clock"       size={14} color="#8b5cf6" />;
  if (msg.includes("time")  || msg.includes("clock"))     return <Feather name="clock"       size={14} color="#06b6d4" />;
  if (msg.includes("connected") || msg.includes("bluetooth")) return <Feather name="bluetooth" size={14} color="#06b6d4" />;
  if (msg.includes("ok")    || msg.includes("success"))   return <AntDesign name="check-circle" size={14} color="#16a34a" />;

  return <Feather name="activity" size={14} color="#64748b" />;
}

// ── Screen ────────────────────────────────────────────────────
export default function Monitoring() {
  const { fontScale } = useWindowDimensions();

  const {
    bleReady,
    isScanning,
    isConnected,
    status,
    mode,
    weight,
    weightPct,    // NEW — 0–100, replaces manual fillProgress calc
    motorDir,     // NEW — 'FWD' | 'REV'
    motorSpeed,   // NEW — 0–255
    rtcTime,      // NEW — "YYYY-MM-DD HH:mm:ss"
    lastEvent,
    binFullAlert,
    syncDeviceTimeNow,
    // Removed: requestWeight — weight is pushed automatically every 5 s
    // Removed: tareScale    — not supported in new firmware via BLE
  } = useBleCommands();

  const numericWeight = Number(weight || 0);
  const binIsFull     = weightPct >= BIN_FULL_PCT;

  // ── Live data monitoring items ────────────────────────────
  const monitoringItems = [
    {
      label:    "Waste Bin Level",
      value:    isConnected ? `${Math.round(weightPct)}%  (${numericWeight.toFixed(1)} g)` : "--",
      sub:      `Alert threshold: ${BIN_FULL_PCT}%`,
      color:    binIsFull ? "#ef4444" : weightPct >= 50 ? "#f59e0b" : "#22c55e",
      progress: weightPct / 100,
    },
    {
      label:    "Conveyor Status",
      value:    status || "--",
      sub:      "Current conveyor state",
      color:    "#3b82f6",
      progress: status === "RUNNING" ? 1 : status === "STOPPED" ? 0.15 : 0,
    },
    {
      label:    "Motor Speed",      // NEW — replaces Operating Mode here; mode stays in quick grid
      value:    isConnected && status === "RUNNING" ? `${motorSpeed}  ·  ${motorDir}` : "--",
      sub:      "Speed (0–255) and direction",
      color:    "#8b5cf6",
      progress: isConnected && status === "RUNNING" ? motorSpeed / 255 : 0,
    },
    {
      label:    "Operating Mode",
      value:    mode || "--",
      sub:      "AUTO fires from schedules",
      color:    "#f59e0b",
      progress: mode === "AUTO" ? 1 : mode === "MANUAL" ? 0.5 : 0,
    },
  ];

  // ── Activity feed ──────────────────────────────────────────
  const combinedHistory: HistoryLikeItem[] = [
    ...(binFullAlert
      ? [{ id: "bin_alert", icon: getHistoryIcon(binFullAlert), details: binFullAlert, timeText: "Latest" }]
      : []),
    ...(lastEvent
      ? [{ id: "last_event", icon: getHistoryIcon(lastEvent), details: lastEvent, timeText: "Just now" }]
      : []),
  ];

  // ── Handlers ──────────────────────────────────────────────
  const handleSyncTime = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }
    try {
      await syncDeviceTimeNow();
      Alert.alert("Success", "Device time synced.");
    } catch (e: any) {
      Alert.alert("Sync Failed", e?.message ?? "Failed to sync device time.");
    }
  };

  // Weight and status refresh automatically — inform the user if they tap refresh
  const handleRefreshInfo = () => {
    Alert.alert(
      "Auto Refresh Active",
      "Weight updates every 5 s and status every 10 s automatically while connected."
    );
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: Platform.OS === "ios" ? 100 : 30,
          gap: 20,
        }}
      >
        {/* ── Page header ──────────────────────────────── */}
        <View style={{ gap: 4 }}>
          <Text style={[styles.pageTitle, { fontSize: 24 * fontScale }]}>
            Monitoring
          </Text>
          <Text style={[styles.pageSubtitle, { fontSize: 14 * fontScale }]}>
            Track waste-bin level, conveyor state, and recent device activity
          </Text>
        </View>

        {/* ── Offline warning ───────────────────────────── */}
        {!isConnected && (
          <View style={styles.warningCard}>
            {isScanning ? (
              <ActivityIndicator size="small" color="#f59e0b" />
            ) : (
              <FontAwesome name="warning" size={18} color="#f59e0b" />
            )}
            <Text style={styles.warningText}>
              {isScanning
                ? "Scanning for device..."
                : !bleReady
                ? "Bluetooth is not ready."
                : "Live monitoring unavailable. Device disconnected."}
            </Text>
          </View>
        )}

        {/* ── Machine Status card ───────────────────────── */}
        <View
          style={[
            globalStyles.card,
            styles.machineCard,
            { opacity: isConnected ? 1 : 0.5 },
          ]}
        >
          <Text style={styles.sectionHeading}>Machine Status</Text>

          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <FontAwesome
                name="circle"
                size={14}
                color={status === "RUNNING" ? "#22c55e" : isConnected ? "#94a3b8" : "#6b7280"}
              />
              <Text style={styles.statusMainText}>
                {status === "RUNNING" ? "Conveyor Running" : "Conveyor Stopped"}
              </Text>
            </View>
            <Text style={styles.statusValueText}>{status || "--"}</Text>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <FontAwesome
                name="circle"
                size={14}
                color={binIsFull ? "#ef4444" : "#22c55e"}
              />
              <Text style={styles.statusMainText}>
                {binIsFull ? "Waste Bin Full" : "Waste Bin OK"}
              </Text>
            </View>
            <Text style={styles.statusValueText}>
              {isConnected ? `${Math.round(weightPct)}%` : "--"}
            </Text>
          </View>

          {/* NEW — direction row */}
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Feather
                name={motorDir === "REV" ? "arrow-left" : "arrow-right"}
                size={14}
                color={status === "RUNNING" ? "#3b82f6" : "#94a3b8"}
              />
              <Text style={styles.statusMainText}>Direction</Text>
            </View>
            <Text style={styles.statusValueText}>
              {isConnected && status === "RUNNING" ? motorDir : "--"}
            </Text>
          </View>

          {/* NEW — speed row */}
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Feather name="zap" size={14} color={status === "RUNNING" ? "#f59e0b" : "#94a3b8"} />
              <Text style={styles.statusMainText}>Speed</Text>
            </View>
            <Text style={styles.statusValueText}>
              {isConnected && status === "RUNNING" ? String(motorSpeed) : "--"}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <FontAwesome
                name="circle"
                size={14}
                color={mode === "AUTO" ? "#3b82f6" : "#94a3b8"}
              />
              <Text style={styles.statusMainText}>
                {mode === "AUTO" ? "Auto Mode" : "Manual Mode"}
              </Text>
            </View>
            <Text style={styles.statusValueText}>{mode || "--"}</Text>
          </View>

          {/* NEW — device clock row */}
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Feather name="clock" size={14} color="#64748b" />
              <Text style={styles.statusMainText}>Device Clock</Text>
            </View>
            <Text style={[styles.statusValueText, { fontSize: 11 }]}>
              {isConnected && rtcTime ? rtcTime : "--"}
            </Text>
          </View>

          <View style={styles.statusRowNoBorder}>
            <View style={styles.statusLeft}>
              <Feather name="bluetooth" size={15} color="#64748b" />
              <Text style={styles.statusMainText}>BLE Link</Text>
            </View>
            <Text style={styles.statusValueText}>
              {isConnected ? "Connected" : "Disconnected"}
            </Text>
          </View>
        </View>

        {/* ── Live Device Data card ─────────────────────── */}
        <View
          style={[
            globalStyles.card,
            styles.dataCard,
            { opacity: isConnected ? 1 : 0.5 },
          ]}
        >
          <Text style={[styles.sectionHeading, { marginBottom: 12 }]}>
            Live Device Data
          </Text>

          {monitoringItems.map((item, index) => (
            <View key={index} style={{ marginTop: index === 0 ? 0 : 16 }}>
              <View style={styles.dataRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.dataLabel}>{item.label}</Text>
                  <Text style={styles.dataSub}>{item.sub}</Text>
                </View>
                <Text style={styles.dataValue}>
                  {isConnected ? item.value : "--"}
                </Text>
              </View>

              <Progress.Bar
                progress={isConnected ? item.progress : 0}
                width={null}
                height={14}
                color={item.color}
                borderRadius={8}
                unfilledColor="#e5e7eb"
                borderWidth={0}
              />
            </View>
          ))}

          {/* Removed: Refresh Weight button — auto-pushed every 5 s  */}
          {/* Removed: Tare Load Cell button — not in new firmware BLE */}

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              !isConnected && styles.secondaryButtonDisabled,
            ]}
            onPress={handleSyncTime}
            disabled={!isConnected}
          >
            <Text style={styles.secondaryButtonText}>Sync Device Time</Text>
          </TouchableOpacity>

          <Text style={styles.hintText}>
            Weight and status refresh automatically every 5–10 s while connected.
          </Text>
        </View>

        {/* ── Quick grid ────────────────────────────────── */}
        <View style={styles.quickGrid}>
          <View style={[globalStyles.card, styles.quickCard]}>
            <Text style={styles.quickLabel}>Bin Full</Text>
            <Text
              style={[
                styles.quickValue,
                { color: binIsFull ? "#ef4444" : "#16a34a" },
              ]}
            >
              {isConnected ? (binIsFull ? "YES" : "NO") : "--"}
            </Text>
            <Text style={styles.quickSub}>
              {isConnected ? `${Math.round(weightPct)}%` : ""}
            </Text>
          </View>

          {/* NEW — Direction (replaces "Auto Mode") */}
          <View style={[globalStyles.card, styles.quickCard]}>
            <Text style={styles.quickLabel}>Direction</Text>
            <Text style={styles.quickValue}>
              {isConnected && status === "RUNNING" ? motorDir : "--"}
            </Text>
          </View>

          <View style={[globalStyles.card, styles.quickCard]}>
            <Text style={styles.quickLabel}>Conveyor</Text>
            <Text style={styles.quickValue}>
              {status === "RUNNING" ? "RUNNING" : "STOPPED"}
            </Text>
          </View>

          <View style={[globalStyles.card, styles.quickCard]}>
            <Text style={styles.quickLabel}>BLE</Text>
            <Text style={styles.quickValue}>
              {isConnected ? "CONNECTED" : "OFFLINE"}
            </Text>
          </View>
        </View>

        {/* ── Recent Activity ───────────────────────────── */}
        <View style={[globalStyles.card, styles.historyCard]}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionHeading}>Recent Activity</Text>
            {/* Refresh is now informational since data is auto-pushed */}
            <TouchableOpacity onPress={handleRefreshInfo}>
              <Feather name="info" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          {combinedHistory.length > 0 ? (
            combinedHistory.slice(0, 20).map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <View style={styles.historyLeft}>
                  <View style={styles.historyIconWrap}>{item.icon}</View>
                  <Text style={[styles.historyText, { fontSize: 15 * fontScale }]}>
                    {item.details}
                  </Text>
                </View>
                <Text style={[styles.historyTime, { fontSize: 12 * fontScale }]}>
                  {item.timeText}
                </Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No activity available yet.</Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },

  pageTitle:    { fontWeight: "800", color: "#1e293b" },
  pageSubtitle: { color: "#94a3b8", fontWeight: "600" },

  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fffbeb",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  warningText: { color: "#92400e", fontSize: 14, fontWeight: "600", flex: 1 },

  machineCard: { paddingHorizontal: 18, paddingVertical: 18, gap: 2 },

  sectionHeading: { fontSize: 18, fontWeight: "800", color: "#1e293b", marginBottom: 12 },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  statusRowNoBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  statusLeft:      { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  statusMainText:  { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  statusValueText: { fontSize: 13, fontWeight: "700", color: "#64748b", marginLeft: 10, maxWidth: "40%", textAlign: "right" },

  dataCard: { paddingHorizontal: 18, paddingVertical: 18 },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  dataLabel: { fontSize: 15, fontWeight: "700", color: "#1e293b" },
  dataSub:   { fontSize: 12, color: "#94a3b8", marginTop: 2 },
  dataValue: { fontSize: 15, fontWeight: "800", color: "#1e293b" },

  secondaryButton: {
    backgroundColor: "#1e293b",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },
  secondaryButtonDisabled: { backgroundColor: "#94a3b8" },
  secondaryButtonText:     { color: "white", fontWeight: "700", fontSize: 16 },

  hintText: { marginTop: 10, fontSize: 12, color: "#64748b", textAlign: "center" },

  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  quickCard: { width: "47%", paddingHorizontal: 16, paddingVertical: 16 },
  quickLabel: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  quickValue: { fontSize: 16, fontWeight: "800", color: "#1e293b", marginTop: 6 },
  quickSub:   { fontSize: 11, color: "#94a3b8", marginTop: 2 },

  historyCard:   { paddingHorizontal: 18, paddingVertical: 18 },
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  historyLeft:    { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 10 },
  historyIconWrap:{ width: 24, alignItems: "center" },
  historyText:    { fontWeight: "600", color: "#1e293b", flex: 1 },
  historyTime:    { color: "#94a3b8", fontWeight: "600" },
  emptyWrap:      { paddingVertical: 20, alignItems: "center" },
  emptyText:      { color: "#94a3b8", fontWeight: "600" },
});