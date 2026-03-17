import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import MyAccordion from "@/components/ui/Accordion";
import BleStatusIndicator from "@/providers/ble/BleStatusIndicator";
import { useBle } from "@/providers/ble/useBle";
import { useBleCommands } from "@/providers/ble/useBleCommands";

export default function HomeScreen() {
  const router = useRouter();

  const { bleReady, isScanning, isConnected, device, scanAndConnect, disconnect } =
    useBle();

  const { status, mode, weight, lastEvent, binFullAlert, requestWeight } =
    useBleCommands();

  const [helpVisible, setHelpVisible] = useState(false);
  const [bleDetailsVisible, setBleDetailsVisible] = useState(false);

  const actions = [
    {
      title: "System Dashboard",
      sub: "Real-time stats & controls",
      icon: "grid",
      color: "#3b82f6",
      bg: "#dbeafe",
      path: "/dashboard",
    },
    {
      title: "Schedule",
      sub: "Manage cleaning schedules",
      icon: "calendar",
      color: "#8b5cf6",
      bg: "#ede9fe",
      path: "/schedule",
    },
    {
      title: "Monitoring",
      sub: "Weight and system activity",
      icon: "activity",
      color: "#10b981",
      bg: "#d1fae5",
      path: "/monitoring",
    },
    {
      title: "Notifications",
      sub: "Alerts and recent events",
      icon: "bell",
      color: "#f59e0b",
      bg: "#fef3c7",
      path: "/notification",
    },
  ];

  const numericWeight = Number(weight || 0);
  const binIsFull = numericWeight >= 500;

  const overviewItems = useMemo(
    () => [
      {
        label: "Conveyor",
        value: String(status).toUpperCase() === "RUNNING" ? "RUNNING" : "STOPPED",
        valueColor:
          String(status).toUpperCase() === "RUNNING" ? "#10b981" : "#64748b",
      },
      {
        label: "Weight",
        value: !Number.isNaN(numericWeight)
          ? `${numericWeight.toFixed(1)} g`
          : "--",
        valueColor: "#1e293b",
      },
      {
        label: "Bin",
        value: binIsFull ? "FULL" : "OK",
        valueColor: binIsFull ? "#ef4444" : "#10b981",
      },
      {
        label: "Mode",
        value: mode || "--",
        valueColor:
          String(mode).toUpperCase() === "AUTO" ? "#8b5cf6" : "#f59e0b",
      },
      {
        label: "BLE",
        value: isConnected ? "CONNECTED" : isScanning ? "SCANNING" : "OFFLINE",
        valueColor: isConnected ? "#10b981" : isScanning ? "#f59e0b" : "#64748b",
      },
      {
        label: "Alert",
        value: binFullAlert ? "ACTIVE" : "NONE",
        valueColor: binFullAlert ? "#ef4444" : "#64748b",
      },
    ],
    [status, numericWeight, binIsFull, mode, isConnected, isScanning, binFullAlert]
  );

  const connectionLabel = isConnected
    ? "Connected"
    : isScanning
    ? "Connecting..."
    : "Disconnected";

  const handleBleAction = async () => {
    try {
      if (isConnected) {
        await disconnect();
      } else if (bleReady && !isScanning) {
        await scanAndConnect();
      } else if (!bleReady) {
        Alert.alert(
          "Bluetooth is Off",
          "Please turn on Bluetooth to connect to the ESP32."
        );
      }
    } catch (e: any) {
      Alert.alert(
        "BLE Error",
        e?.message ?? "Failed to perform Bluetooth action."
      );
    }
  };

  const handleRefreshOverview = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }

    try {
      await requestWeight();
    } catch (e: any) {
      Alert.alert(
        "Refresh Failed",
        e?.message ?? "Failed to refresh device data."
      );
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <ImageBackground
          source={require("@/assets/images/barn.jpg")}
          style={styles.heroImage}
          imageStyle={styles.heroImageStyle}
        >
          <LinearGradient
            colors={["rgba(15, 23, 42, 0.4)", "rgba(15, 23, 42, 0.8)"]}
            style={styles.gradient}
          >
            <SafeAreaView style={styles.headerTop}>
              <TouchableOpacity onPress={() => setBleDetailsVisible(true)}>
                <BleStatusIndicator />
              </TouchableOpacity>
            </SafeAreaView>

            <View style={styles.heroContent}>
              <Text style={styles.welcomeText}>Hello, Farmer</Text>
              <Text style={styles.subWelcomeText}>
                {isConnected
                  ? "Your cleaning conveyor system is connected."
                  : "Connect to your cleaning conveyor system to start monitoring."}
              </Text>
            </View>
          </LinearGradient>
        </ImageBackground>

        <View style={styles.sectionWrap}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>System Overview</Text>
            <TouchableOpacity onPress={handleRefreshOverview}>
              <Feather name="refresh-cw" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <View style={styles.overviewCard}>
            {overviewItems.map((item, idx) => (
              <View
                key={`${item.label}-${idx}`}
                style={[
                  styles.overviewRow,
                  idx !== overviewItems.length - 1 && styles.rowBorder,
                ]}
              >
                <Text style={styles.overviewLabel}>{item.label}</Text>
                <Text style={[styles.overviewValue, { color: item.valueColor }]}>
                  {item.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.gridContainer}>
          <Text style={styles.sectionTitle}>Quick Access</Text>

          <View style={styles.stack}>
            {actions.map((item, idx) => (
              <Pressable
                key={idx}
                onPress={() => router.push(item.path as any)}
                style={styles.largeCard}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                  <Feather name={item.icon as any} size={24} color={item.color} />
                </View>

                <View style={styles.cardTextContainer}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardSub}>{item.sub}</Text>
                </View>

                <Feather name="chevron-right" size={20} color="#cbd5e1" />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Latest Event</Text>
          <View style={styles.lastEventCard}>
            <Text style={styles.lastEventText}>
              {lastEvent || "No recent device activity yet."}
            </Text>
            {binFullAlert ? (
              <Text style={styles.lastAlertText}>{binFullAlert}</Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          style={styles.helpBar}
          onPress={() => setHelpVisible(true)}
        >
          <View style={styles.helpRow}>
            <Ionicons name="help-circle-outline" size={22} color="#64748b" />
            <Text style={styles.helpText}>How to use this app</Text>
          </View>
          <Feather name="arrow-right" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </ScrollView>

      <Modal animationType="slide" visible={helpVisible}>
        <SafeAreaProvider>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Help Center</Text>
              <TouchableOpacity onPress={() => setHelpVisible(false)}>
                <Ionicons name="close-circle" size={32} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            >
              <MyAccordion />
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <Modal transparent visible={bleDetailsVisible} animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Connection Details</Text>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bluetooth</Text>
              <Text style={styles.detailValue}>
                {bleReady ? "Enabled" : "Disabled"}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status</Text>
              <Text
                style={[
                  styles.detailValue,
                  {
                    color: isConnected
                      ? "#10b981"
                      : isScanning
                      ? "#f59e0b"
                      : "#ef4444",
                  },
                ]}
              >
                {connectionLabel}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Device</Text>
              <Text style={styles.detailValue}>
                {device?.name ?? device?.localName ?? "None"}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Conveyor</Text>
              <Text style={styles.detailValue}>{status || "--"}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Mode</Text>
              <Text style={styles.detailValue}>{mode || "--"}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Weight</Text>
              <Text style={styles.detailValue}>
                {!Number.isNaN(numericWeight) ? `${numericWeight.toFixed(1)} g` : "--"}
              </Text>
            </View>

            <TouchableOpacity style={styles.actionBtn} onPress={handleBleAction}>
              <Text style={styles.actionBtnText}>
                {isConnected ? "Disconnect" : isScanning ? "Connecting..." : "Connect"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setBleDetailsVisible(false)}
            >
              <Text style={styles.closeBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  heroImage: {
    width: "100%",
    height: 280,
  },
  heroImageStyle: {
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  gradient: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 24,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },

  headerTop: {
    position: "absolute",
    top: Platform.OS === "ios" ? 10 : 40,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },

  heroContent: {
    marginBottom: 10,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: "800",
    color: "white",
    letterSpacing: -0.5,
  },
  subWelcomeText: {
    fontSize: 16,
    color: "#e2e8f0",
    marginTop: 4,
  },

  sectionWrap: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },

  overviewCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  overviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  overviewLabel: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "600",
  },
  overviewValue: {
    fontSize: 15,
    fontWeight: "800",
  },

  gridContainer: {
    padding: 24,
  },
  stack: {
    gap: 16,
  },
  largeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 24,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },
  cardSub: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
  },

  lastEventCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  lastEventText: {
    color: "#1e293b",
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  lastAlertText: {
    marginTop: 10,
    color: "#ef4444",
    fontWeight: "800",
    fontSize: 13,
  },

  helpBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  helpRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  helpText: {
    marginLeft: 12,
    color: "#1e293b",
    fontWeight: "600",
  },

  modalSafe: {
    flex: 1,
    backgroundColor: "white",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#1e293b",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  detailsCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "white",
    padding: 24,
    borderRadius: 30,
  },
  detailsTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  detailLabel: {
    color: "#64748b",
    fontWeight: "600",
  },
  detailValue: {
    color: "#1e293b",
    fontWeight: "700",
    maxWidth: "58%",
    textAlign: "right",
  },

  actionBtn: {
    marginTop: 18,
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
  },
  actionBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },

  closeBtn: {
    marginTop: 12,
    backgroundColor: "#1e293b",
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
  },
  closeBtnText: {
    color: "white",
    fontWeight: "700",
  },
});