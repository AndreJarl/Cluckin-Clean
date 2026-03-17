import React, { useMemo } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useBleCommands } from "@/providers/ble/useBleCommands";
import { useBle } from "@/providers/ble/useBle";

type NotificationCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

function NotificationCard({
  title,
  value,
  subtitle,
  tone = "default",
}: NotificationCardProps) {
  const toneStyles = {
    default: {
      border: "border-gray-100",
      title: "text-gray-400",
      value: "text-gray-900",
      subtitle: "text-gray-500",
    },
    success: {
      border: "border-green-100",
      title: "text-green-500",
      value: "text-green-700",
      subtitle: "text-green-600",
    },
    warning: {
      border: "border-amber-100",
      title: "text-amber-500",
      value: "text-amber-700",
      subtitle: "text-amber-600",
    },
    danger: {
      border: "border-red-100",
      title: "text-red-500",
      value: "text-red-700",
      subtitle: "text-red-600",
    },
    info: {
      border: "border-blue-100",
      title: "text-blue-500",
      value: "text-blue-700",
      subtitle: "text-blue-600",
    },
  }[tone];

  return (
    <View className={`bg-white rounded-3xl p-4 mb-4 border ${toneStyles.border} shadow-sm`}>
      <Text className={`text-xs uppercase tracking-widest mb-1 ${toneStyles.title}`}>
        {title}
      </Text>
      <Text className={`text-lg font-semibold ${toneStyles.value}`}>{value}</Text>
      {subtitle ? (
        <Text className={`text-sm mt-1 ${toneStyles.subtitle}`}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

export default function Notification() {
  const { isConnected, bleReady, isScanning } = useBle();

  const {
    status,
    mode,
    weight,
    lastEvent,
    binFullAlert,
    requestStatus,
    requestWeight,
    syncDeviceTimeNow,
  } = useBleCommands();

  const cards = useMemo(() => {
    const numericWeight = Number(weight || 0);
    const weightText = Number.isNaN(numericWeight)
      ? "--"
      : `${numericWeight.toFixed(1)} g`;

    return [
      {
        title: "BLE",
        value: bleReady
          ? isConnected
            ? "Connected"
            : isScanning
            ? "Scanning..."
            : "Disconnected"
          : "Bluetooth Off",
        subtitle: bleReady
          ? isConnected
            ? "The app is connected to the ESP32."
            : "Tap connect from the dashboard or BLE indicator."
          : "Turn on Bluetooth to connect to the device.",
        tone: isConnected
          ? "success"
          : isScanning
          ? "warning"
          : "default",
      },
      {
        title: "Conveyor",
        value: status || "Unknown",
        subtitle:
          String(status).toUpperCase() === "RUNNING"
            ? "The conveyor is currently operating."
            : "The conveyor is currently stopped.",
        tone:
          String(status).toUpperCase() === "RUNNING" ? "info" : "default",
      },
      {
        title: "Mode",
        value: mode || "Unknown",
        subtitle:
          String(mode).toUpperCase() === "AUTO"
            ? "Schedules can run the conveyor automatically."
            : "The system is currently under manual control.",
        tone:
          String(mode).toUpperCase() === "AUTO" ? "info" : "warning",
      },
      {
        title: "Weight",
        value: weightText,
        subtitle: "Current waste-bin weight reported by the ESP32.",
        tone:
          !Number.isNaN(numericWeight) && numericWeight >= 500
            ? "danger"
            : "success",
      },
      {
        title: "Bin Alert",
        value: binFullAlert ? "Waste Bin Full" : "No Active Alert",
        subtitle: binFullAlert
          ? binFullAlert
          : "No full-bin notification is active right now.",
        tone: binFullAlert ? "danger" : "default",
      },
      {
        title: "Last Event",
        value: lastEvent || "No recent event",
        subtitle: "Most recent BLE event received from the ESP32.",
        tone: "default",
      },
    ] as const;
  }, [bleReady, isConnected, isScanning, status, mode, weight, binFullAlert, lastEvent]);

  const handleRefresh = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }

    try {
      await requestStatus();
      await new Promise(resolve => setTimeout(resolve, 120));
      await requestWeight();
    } catch (e: any) {
      Alert.alert(
        "Refresh Failed",
        e?.message ?? "Failed to refresh notifications."
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
        "Time Sync Failed",
        e?.message ?? "Failed to sync device time."
      );
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={handleRefresh} />
      }
    >
      <View className="mb-6">
        <Text className="text-3xl font-bold text-gray-900">Notifications</Text>
        <Text className="text-sm text-gray-500 mt-1">
          Live BLE updates and current device state
        </Text>
      </View>

      <View className="flex-row gap-3 mb-4">
        <TouchableOpacity
          onPress={handleRefresh}
          className="flex-1 bg-blue-600 rounded-2xl py-4 px-4 flex-row items-center justify-center"
        >
          <Feather name="refresh-cw" size={16} color="white" />
          <Text className="text-white font-bold ml-2">Refresh</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSyncTime}
          className="flex-1 bg-slate-800 rounded-2xl py-4 px-4 flex-row items-center justify-center"
        >
          <Feather name="clock" size={16} color="white" />
          <Text className="text-white font-bold ml-2">Sync Time</Text>
        </TouchableOpacity>
      </View>

      {cards.map((card) => (
        <NotificationCard
          key={card.title}
          title={card.title}
          value={card.value}
          subtitle={card.subtitle}
          tone={card.tone}
        />
      ))}

      {!isConnected ? (
        <View className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm mt-2">
          <Text className="text-lg font-semibold text-gray-900 mb-1">
            Device not connected
          </Text>
          <Text className="text-sm text-gray-500">
            Connect to your ESP32 to receive live updates and alerts.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}