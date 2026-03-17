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

import AntDesign from "@expo/vector-icons/AntDesign";
import Entypo from "@expo/vector-icons/Entypo";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import * as Progress from "react-native-progress";

import { useBleCommands } from "@/providers/ble/useBleCommands";

const BIN_FULL_THRESHOLD_G = 500;

type HistoryLikeItem = {
  id: string;
  icon: React.ReactNode;
  details: string;
  timeText: string;
};

function getHistoryIcon(message: string) {
  const msg = (message || "").toLowerCase();

  if (msg.includes("full") || msg.includes("bin")) {
    return <Entypo name="warning" size={14} color="#f59e0b" />;
  }

  if (msg.includes("conveyor") || msg.includes("motor")) {
    return <FontAwesome name="gear" size={14} color="#2563eb" />;
  }

  if (msg.includes("schedule")) {
    return <Feather name="clock" size={14} color="#8b5cf6" />;
  }

  if (msg.includes("tare")) {
    return <Feather name="sliders" size={14} color="#10b981" />;
  }

  if (msg.includes("time")) {
    return <Feather name="clock" size={14} color="#06b6d4" />;
  }

  if (msg.includes("connected") || msg.includes("bluetooth")) {
    return <Feather name="bluetooth" size={14} color="#06b6d4" />;
  }

  if (msg.includes("ok") || msg.includes("success")) {
    return <AntDesign name="check-circle" size={14} color="#16a34a" />;
  }

  return <Feather name="activity" size={14} color="#64748b" />;
}

export default function Monitoring() {
  const { fontScale } = useWindowDimensions();

  const {
    bleReady,
    isScanning,
    isConnected,
    status,
    mode,
    weight,
    lastEvent,
    binFullAlert,
    requestWeight,
    tareScale,
    syncDeviceTimeNow,
  } = useBleCommands();

  const numericWeight = Number(weight || 0);
  const fillProgress =
    BIN_FULL_THRESHOLD_G > 0
      ? Math.min(Math.max(numericWeight / BIN_FULL_THRESHOLD_G, 0), 1)
      : 0;

  const monitoringItems = [
    {
      label: "Waste Bin Weight",
      value: !Number.isNaN(numericWeight) ? `${numericWeight.toFixed(1)} g` : "--",
      sub: `Threshold: ${BIN_FULL_THRESHOLD_G} g`,
      color: "#22c55e",
      progress: fillProgress,
    },
    {
      label: "Conveyor Status",
      value: status || "--",
      sub: "Current conveyor state",
      color: "#3b82f6",
      progress:
        String(status).toUpperCase() === "RUNNING"
          ? 1
          : String(status).toUpperCase() === "STOPPED"
          ? 0.15
          : 0,
    },
    {
      label: "Operating Mode",
      value: mode || "--",
      sub: "Manual or Auto",
      color: "#f59e0b",
      progress:
        String(mode).toUpperCase() === "AUTO"
          ? 1
          : String(mode).toUpperCase() === "MANUAL"
          ? 0.5
          : 0,
    },
  ];

  const combinedHistory: HistoryLikeItem[] = [
    ...(binFullAlert
      ? [
          {
            id: "bin_alert",
            icon: getHistoryIcon(binFullAlert),
            details: binFullAlert,
            timeText: "Latest",
          },
        ]
      : []),
    ...(lastEvent
      ? [
          {
            id: "last_event",
            icon: getHistoryIcon(lastEvent),
            details: lastEvent,
            timeText: "Just now",
          },
        ]
      : []),
  ];

  const handleTare = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }

    Alert.alert(
      "Tare Load Cell",
      "Make sure the bin/load cell is empty before taring.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Tare",
          onPress: async () => {
            try {
              await tareScale();
              Alert.alert("Success", "Tare command sent.");
            } catch (e: any) {
              Alert.alert(
                "Tare Failed",
                e?.message ?? "Failed to tare load cell."
              );
            }
          },
        },
      ]
    );
  };

  const handleRefresh = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }

    try {
      await requestWeight();
    } catch (e: any) {
      Alert.alert(
        "Refresh Failed",
        e?.message ?? "Failed to refresh weight."
      );
    }
  };

  const handleSyncTime = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }

    try {
      await syncDeviceTimeNow();
      Alert.alert("Success", "Device time synced.");
    } catch (e: any) {
      Alert.alert(
        "Sync Failed",
        e?.message ?? "Failed to sync device time."
      );
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: Platform.OS === "ios" ? 100 : 30,
          gap: 20,
        }}
      >
        <View style={{ gap: 4 }}>
          <Text style={[styles.pageTitle, { fontSize: 24 * fontScale }]}>
            Monitoring
          </Text>
          <Text style={[styles.pageSubtitle, { fontSize: 14 * fontScale }]}>
            Track waste-bin level, conveyor state, and recent device activity
          </Text>
        </View>

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
                color={
                  String(status).toUpperCase() === "RUNNING"
                    ? "#22c55e"
                    : isConnected
                    ? "#94a3b8"
                    : "#6b7280"
                }
              />
              <Text style={styles.statusMainText}>
                {String(status).toUpperCase() === "RUNNING"
                  ? "Conveyor Running"
                  : "Conveyor Stopped"}
              </Text>
            </View>
            <Text style={styles.statusValueText}>{status || "--"}</Text>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <FontAwesome
                name="circle"
                size={14}
                color={numericWeight >= BIN_FULL_THRESHOLD_G ? "#ef4444" : "#22c55e"}
              />
              <Text style={styles.statusMainText}>
                {numericWeight >= BIN_FULL_THRESHOLD_G
                  ? "Waste Bin Full"
                  : "Waste Bin OK"}
              </Text>
            </View>
            <Text style={styles.statusValueText}>
              {!Number.isNaN(numericWeight) ? `${numericWeight.toFixed(1)} g` : "--"}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <FontAwesome
                name="circle"
                size={14}
                color={String(mode).toUpperCase() === "AUTO" ? "#3b82f6" : "#94a3b8"}
              />
              <Text style={styles.statusMainText}>
                {String(mode).toUpperCase() === "AUTO" ? "Auto Mode" : "Manual Mode"}
              </Text>
            </View>
            <Text style={styles.statusValueText}>{mode || "--"}</Text>
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
                <View>
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

          <TouchableOpacity
            style={[
              styles.actionButton,
              !isConnected && styles.actionButtonDisabled,
            ]}
            onPress={handleRefresh}
            disabled={!isConnected}
          >
            <Text style={styles.actionButtonText}>Refresh Weight</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tareButton,
              !isConnected && styles.tareButtonDisabled,
            ]}
            onPress={handleTare}
            disabled={!isConnected}
          >
            <Text style={styles.tareButtonText}>Tare Load Cell</Text>
          </TouchableOpacity>

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

          <Text style={styles.tareHint}>
            Only tare when the bin/load cell is empty.
          </Text>
        </View>

        <View style={styles.quickGrid}>
          <View style={[globalStyles.card, styles.quickCard]}>
            <Text style={styles.quickLabel}>Bin Full</Text>
            <Text
              style={[
                styles.quickValue,
                { color: numericWeight >= BIN_FULL_THRESHOLD_G ? "#ef4444" : "#16a34a" },
              ]}
            >
              {numericWeight >= BIN_FULL_THRESHOLD_G ? "YES" : "NO"}
            </Text>
          </View>

          <View style={[globalStyles.card, styles.quickCard]}>
            <Text style={styles.quickLabel}>Auto Mode</Text>
            <Text style={styles.quickValue}>
              {String(mode).toUpperCase() === "AUTO" ? "ON" : "OFF"}
            </Text>
          </View>

          <View style={[globalStyles.card, styles.quickCard]}>
            <Text style={styles.quickLabel}>Conveyor</Text>
            <Text style={styles.quickValue}>
              {String(status).toUpperCase() === "RUNNING" ? "RUNNING" : "STOPPED"}
            </Text>
          </View>

          <View style={[globalStyles.card, styles.quickCard]}>
            <Text style={styles.quickLabel}>BLE</Text>
            <Text style={styles.quickValue}>
              {isConnected ? "CONNECTED" : "OFFLINE"}
            </Text>
          </View>
        </View>

        <View style={[globalStyles.card, styles.historyCard]}>
          <View style={styles.historyHeader}>
            <Text style={styles.sectionHeading}>Recent Activity</Text>

            <TouchableOpacity onPress={handleRefresh}>
              <Feather name="refresh-cw" size={18} color="#64748b" />
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

  pageTitle: {
    fontWeight: "800",
    color: "#1e293b",
  },
  pageSubtitle: {
    color: "#94a3b8",
    fontWeight: "600",
  },

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
  warningText: {
    color: "#92400e",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },

  machineCard: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 2,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 12,
  },
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
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  statusMainText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e293b",
  },
  statusValueText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    marginLeft: 10,
    maxWidth: "40%",
    textAlign: "right",
  },

  dataCard: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  dataLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1e293b",
  },
  dataSub: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 2,
  },
  dataValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1e293b",
  },

  actionButton: {
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },
  actionButtonDisabled: {
    backgroundColor: "#94a3b8",
  },
  actionButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  tareButton: {
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
  },
  tareButtonDisabled: {
    backgroundColor: "#94a3b8",
  },
  tareButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  secondaryButton: {
    backgroundColor: "#1e293b",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
  },
  secondaryButtonDisabled: {
    backgroundColor: "#94a3b8",
  },
  secondaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  tareHint: {
    marginTop: 10,
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },

  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  quickCard: {
    width: "47%",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  quickLabel: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  quickValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1e293b",
    marginTop: 6,
  },

  historyCard: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f8fafc",
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 10,
  },
  historyIconWrap: {
    width: 24,
    alignItems: "center",
  },
  historyText: {
    fontWeight: "600",
    color: "#1e293b",
    flex: 1,
  },
  historyTime: {
    color: "#94a3b8",
    fontWeight: "600",
  },
  emptyWrap: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyText: {
    color: "#94a3b8",
    fontWeight: "600",
  },
});