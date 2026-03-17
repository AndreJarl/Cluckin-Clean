import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Alert,
  AlertButton,
} from "react-native";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import { useBle } from "./useBle";

export default function BleStatusIndicator() {
  const {
    bleReady,
    isScanning,
    isConnected,
    device,
    scanAndConnect,
    disconnect,
  } = useBle();

  const pulse = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.6,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulse]);

  const effectiveStatus = !bleReady
    ? "bluetooth-off"
    : isConnected
    ? "connected"
    : isScanning
    ? "connecting"
    : "disconnected";

  const color =
    effectiveStatus === "connected"
      ? "#22c55e"
      : effectiveStatus === "connecting"
      ? "#facc15"
      : "#ef4444";

  const label =
    effectiveStatus === "connected"
      ? "Connected"
      : effectiveStatus === "connecting"
      ? "Connecting..."
      : effectiveStatus === "bluetooth-off"
      ? "Turn on Bluetooth"
      : "Tap to connect";

  const onPress = async () => {
    if (!bleReady) {
      Alert.alert(
        "Bluetooth is Off",
        "Please turn on Bluetooth to connect to the ESP32."
      );
      return;
    }

    if (!isConnected && !isScanning) {
      try {
        await scanAndConnect();
      } catch (e: any) {
        Alert.alert(
          "Connection Failed",
          e?.message ?? "Could not connect to the ESP32."
        );
      }
    }
  };

  const onLongPress = () => {
    const buttons: AlertButton[] = [];

    if (isConnected) {
      buttons.push({
        text: "Disconnect",
        onPress: () => {
          disconnect().catch(() => {});
        },
        style: "destructive",
      });
    }

    buttons.push({ text: "Close", style: "cancel" });

    Alert.alert(
      "BLE Details",
      `Bluetooth: ${bleReady ? "ON" : "OFF"}
Scanning: ${isScanning ? "YES" : "NO"}
Connected: ${isConnected ? "YES" : "NO"}
Device: ${device?.name ?? device?.localName ?? "None"}
ID: ${device?.id ?? "—"}`,
      buttons
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.wrapper}
    >
      <View style={styles.card}>
        <Animated.View
          style={[
            styles.dot,
            { backgroundColor: color, transform: [{ scale: pulse }] },
          ]}
        />
        <FontAwesome5
          name="bluetooth-b"
          size={14}
          color={bleReady ? "#60a5fa" : "#94a3b8"}
        />
        <Text style={styles.text}>{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    marginVertical: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    gap: 8,
    elevation: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    color: "#e5e7eb",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});