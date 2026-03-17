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
  variant?: "primary" | "secondary" | "danger";
}) => {
  const backgroundColor =
    variant === "danger"
      ? "#ef4444"
      : variant === "secondary"
        ? "#1e293b"
        : "#3b82f6";

  const borderColor =
    variant === "secondary" ? "#334155" : "transparent";

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

function getSystemColor(isConnected: boolean) {
  return isConnected ? "#22c55e" : "#ef4444";
}

function getSystemLabel(isConnected: boolean, bleReady: boolean, isScanning: boolean) {
  if (!bleReady) return "BLUETOOTH OFF";
  if (isScanning) return "SCANNING";
  return isConnected ? "OPERATIONAL" : "DISCONNECTED";
}

export default function Dashboard() {
  const { width, fontScale } = useWindowDimensions();

  const {
    bleReady,
    isScanning,
    isConnected,
    status,
    mode,
    weight,
    lastEvent,
    binFullAlert,
    scanAndConnect,
    disconnect,
    startConveyor,
    stopConveyor,
    setAutoMode,
    requestWeight,
    syncDeviceTimeNow,
  } = useBleCommands();

  const numericWeight = Number(weight || 0);
  const wasteLevelPoints = [
    0,
    Math.max(0, numericWeight * 0.35),
    Math.max(0, numericWeight * 0.7),
    numericWeight || 0,
  ];

  const systemColor = getSystemColor(isConnected);
  const systemLabel = getSystemLabel(isConnected, bleReady, isScanning);

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

  const handleAuto = async () => {
    try {
      await setAutoMode();
    } catch (e: any) {
      Alert.alert("Auto Mode Failed", e?.message ?? "Failed to enable auto mode.");
    }
  };

  const handleRefreshWeight = async () => {
    try {
      await requestWeight();
    } catch (e: any) {
      Alert.alert("Refresh Failed", e?.message ?? "Failed to get weight.");
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      >
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
              style={{
                fontSize: 28 * fontScale,
                fontWeight: "800",
                color: "#f8fafc",
              }}
            >
              Dashboard
            </Text>
            <Text
              style={{
                fontSize: 14 * fontScale,
                color: "#94a3b8",
                marginTop: 4,
              }}
            >
              Smart Chicken Waste Cleaning System
            </Text>
          </View>
          <BleStatusIndicator />
        </View>

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

        <GlassCard>
          <Text
            style={{
              color: "#cbd5e1",
              fontSize: 14,
              fontWeight: "600",
              marginBottom: 16,
            }}
          >
            DEVICE STATUS
          </Text>

          <View style={{ gap: 14 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 13 }}>BLE Ready</Text>
              <Text style={{ color: "#f8fafc", fontWeight: "700" }}>
                {String(bleReady)}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 13 }}>Connected</Text>
              <Text style={{ color: "#f8fafc", fontWeight: "700" }}>
                {String(isConnected)}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 13 }}>Scanning</Text>
              <Text style={{ color: "#f8fafc", fontWeight: "700" }}>
                {String(isScanning)}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 13 }}>Conveyor</Text>
              <Text style={{ color: "#f8fafc", fontWeight: "700" }}>
                {status}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 13 }}>Mode</Text>
              <Text style={{ color: "#f8fafc", fontWeight: "700" }}>
                {mode}
              </Text>
            </View>
          </View>
        </GlassCard>

        <GlassCard>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 15,
            }}
          >
            <Text style={{ color: "#cbd5e1", fontSize: 14, fontWeight: "600" }}>
              WASTE BIN LEVEL
            </Text>
            <Text style={{ color: "#3b82f6", fontWeight: "700" }}>
              {weight} g
            </Text>
          </View>

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
            height={180}
            chartConfig={{
              backgroundGradientFrom: "#1e293b",
              backgroundGradientTo: "#1e293b",
              decimalPlaces: 0,
              color: (o = 1) => `rgba(255, 255, 255, ${o})`,
              labelColor: (o = 1) => `rgba(148, 163, 184, ${o})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: "4",
                strokeWidth: "2",
                stroke: "#3b82f6",
              },
            }}
            bezier
            style={{ marginVertical: 8, borderRadius: 16, marginLeft: -20 }}
          />
        </GlassCard>

        <GlassCard>
          <Text
            style={{
              color: "#cbd5e1",
              fontSize: 14,
              fontWeight: "600",
              marginBottom: 16,
            }}
          >
            CONTROLS
          </Text>

          <View style={{ gap: 12 }}>
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

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Start"
                  icon="play"
                  onPress={handleStart}
                  disabled={!isConnected}
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

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Auto Mode"
                  icon="repeat"
                  onPress={handleAuto}
                  disabled={!isConnected}
                  variant="secondary"
                />
              </View>
              <View style={{ flex: 1 }}>
                <ActionButton
                  title="Refresh Weight"
                  icon="refresh-cw"
                  onPress={handleRefreshWeight}
                  disabled={!isConnected}
                  variant="secondary"
                />
              </View>
            </View>

            <ActionButton
              title="Sync Device Time"
              icon="clock"
              onPress={handleSyncTime}
              disabled={!isConnected}
              variant="secondary"
            />
          </View>
        </GlassCard>

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
              <Text style={{ color: "#f87171", fontWeight: "800", marginBottom: 4 }}>
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
              style={{
                color: "#94a3b8",
                fontSize: 13,
                lineHeight: 20,
              }}
              selectable
            >
              {lastEvent || "No recent activity"}
            </Text>
          </View>
        </GlassCard>

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