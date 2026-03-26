import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { onValue, ref } from "firebase/database";

import { db } from "@/lib/firebase";

const DEVICE_ID = "conveyorCleaner01";

type DeviceStatus = {
  wifiConnected?: boolean;
  updatedAtMs?: number;
  loadCell?: {
    raw?: number;
    weightGrams?: number;
    weightKg?: number;
    loadPresent?: boolean;
    binFull?: boolean;
  };
  settings?: {
    binFullThresholdGrams?: number;
  };
  rtc?: {
    dateTime?: string;
  };
};

type HistoryItem = {
  id: string;
  title?: string;
  status?: "EXECUTED" | "FAILED" | "SKIPPED" | string;
  date?: string;
  hour?: string;
  minute?: string;
  duration?: string;
  executedAt?: number | string;
  scheduleId?: string;
};

type AppNotification = {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  timestamp?: number;
  source: "status" | "history" | "system";
};

function normalizeTimestamp(value?: number | string): number | undefined {
  if (value == null) return undefined;

  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;

  // seconds -> milliseconds
  if (num < 1e12) return num * 1000;

  return num;
}

function buildTimestampFromHistory(item: HistoryItem): number | undefined {
  const executedAt = normalizeTimestamp(item.executedAt);
  if (executedAt) return executedAt;

  if (!item.date) return undefined;

  const hour = Number(item.hour);
  const minute = Number(item.minute);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;

  const [year, month, day] = item.date.split("-").map(Number);
  if (!year || !month || !day) return undefined;

  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  const time = dt.getTime();

  if (!Number.isFinite(time) || time <= 0) return undefined;

  return time;
}

function mapHistory(
  value: Record<string, Omit<HistoryItem, "id">> | null | undefined
): HistoryItem[] {
  if (!value) return [];

  return Object.entries(value)
    .map(([id, item]) => {
      const raw = item as Omit<HistoryItem, "id">;
      return {
        id,
        ...raw,
        executedAt: buildTimestampFromHistory({ id, ...raw }),
      };
    })
    .sort((a, b) => Number(b.executedAt ?? 0) - Number(a.executedAt ?? 0));
}

function formatTimeAgo(ts?: number) {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "Unknown time";

  const diff = Date.now() - ts;

  if (diff < 0) return "In the future";

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  const week = Math.floor(day / 7);
  if (week < 5) return `${week}w ago`;

  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;

  const year = Math.floor(day / 365);
  return `${year}y ago`;
}

function formatTo12Hour(hour?: string, minute?: string) {
  if (hour == null || minute == null) return "--";

  let h = Number(hour);
  if (!Number.isFinite(h)) return "--";

  const mNum = Number(minute);
  if (!Number.isFinite(mNum)) return "--";

  const m = String(mNum).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;

  return `${h}:${m} ${period}`;
}

function buildHistoryMessage(item: HistoryItem) {
  const title = item.title || "Schedule event";
  const time = formatTo12Hour(item.hour, item.minute);
  const duration = item.duration ? `${item.duration} min` : "--";
  return `${title} • ${time} • ${duration}`;
}

function notificationMeta(type: AppNotification["type"]) {
  switch (type) {
    case "success":
      return {
        icon: "check-circle" as const,
        iconLib: "feather" as const,
        tint: "#16a34a",
        bg: "#dcfce7",
        border: "#bbf7d0",
      };
    case "error":
      return {
        icon: "close-circle" as const,
        iconLib: "ionicons" as const,
        tint: "#dc2626",
        bg: "#fee2e2",
        border: "#fecaca",
      };
    case "warning":
      return {
        icon: "warning" as const,
        iconLib: "ionicons" as const,
        tint: "#d97706",
        bg: "#fef3c7",
        border: "#fde68a",
      };
    default:
      return {
        icon: "information-circle" as const,
        iconLib: "ionicons" as const,
        tint: "#2563eb",
        bg: "#dbeafe",
        border: "#bfdbfe",
      };
  }
}

function NotificationIcon({ type }: { type: AppNotification["type"] }) {
  const meta = notificationMeta(type);

  return (
    <View
      style={[
        styles.notificationIconWrap,
        {
          backgroundColor: meta.bg,
          borderColor: meta.border,
        },
      ]}
    >
      {meta.iconLib === "feather" ? (
        <Feather name={meta.icon} size={18} color={meta.tint} />
      ) : (
        <Ionicons name={meta.icon} size={18} color={meta.tint} />
      )}
    </View>
  );
}

export default function NotificationScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [statusData, setStatusData] = useState<DeviceStatus | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const lastWifiRef = useRef<boolean | null>(null);
  const lastBinFullRef = useRef<boolean | null>(null);
  const seenHistoryIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const statusRef = ref(db, `/devices/${DEVICE_ID}/status`);
    const historyRef = ref(db, `/devices/${DEVICE_ID}/history`);

    const unsubStatus = onValue(
      statusRef,
      (snapshot) => {
        const status = snapshot.val() as DeviceStatus | null;
        setStatusData(status);

        const wifiConnected = !!status?.wifiConnected;
        const binFull = !!status?.loadCell?.binFull;
        const weightGrams = Number(status?.loadCell?.weightGrams ?? 0);
        const threshold = Number(status?.settings?.binFullThresholdGrams ?? 500);

        if (lastWifiRef.current === null) {
          lastWifiRef.current = wifiConnected;
        } else if (lastWifiRef.current !== wifiConnected) {
          const newNotification: AppNotification = wifiConnected
            ? {
                id: `wifi_connected_${Date.now()}`,
                type: "success",
                title: "ESP32 Connected",
                message: "The device is now online and connected to Firebase.",
                timestamp: Date.now(),
                source: "status",
              }
            : {
                id: `wifi_disconnected_${Date.now()}`,
                type: "error",
                title: "ESP32 Disconnected",
                message: "The device went offline. Check power or Wi-Fi connection.",
                timestamp: Date.now(),
                source: "status",
              };

          setNotifications((prev) => [newNotification, ...prev]);
          lastWifiRef.current = wifiConnected;
        }

        if (lastBinFullRef.current === null) {
          lastBinFullRef.current = binFull;
        } else if (lastBinFullRef.current !== binFull) {
          if (binFull) {
            const newNotification: AppNotification = {
              id: `bin_full_${Date.now()}`,
              type: "warning",
              title: "Bin Full Alert",
              message: `The load cell detected a full bin. Current weight: ${weightGrams.toFixed(
                0
              )} g • Threshold: ${threshold.toFixed(0)} g.`,
              timestamp: Date.now(),
              source: "status",
            };
            setNotifications((prev) => [newNotification, ...prev]);
          } else {
            const newNotification: AppNotification = {
              id: `bin_cleared_${Date.now()}`,
              type: "info",
              title: "Bin Status Cleared",
              message: "The bin is no longer marked as full.",
              timestamp: Date.now(),
              source: "status",
            };
            setNotifications((prev) => [newNotification, ...prev]);
          }

          lastBinFullRef.current = binFull;
        }

        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    const unsubHistory = onValue(historyRef, (snapshot) => {
      const items = mapHistory(snapshot.val());
      setHistory(items);

      items.forEach((item) => {
        if (seenHistoryIdsRef.current.has(item.id)) return;

        if (seenHistoryIdsRef.current.size === 0) {
          seenHistoryIdsRef.current.add(item.id);
          return;
        }

        const status = item.status || "UNKNOWN";
        const eventTimestamp = buildTimestampFromHistory(item);

        let newNotification: AppNotification | null = null;

        if (status === "EXECUTED") {
          newNotification = {
            id: `history_success_${item.id}`,
            type: "success",
            title: "Schedule Completed",
            message: buildHistoryMessage(item),
            timestamp: eventTimestamp,
            source: "history",
          };
        } else if (status === "FAILED") {
          newNotification = {
            id: `history_failed_${item.id}`,
            type: "error",
            title: "Schedule Failed",
            message: buildHistoryMessage(item),
            timestamp: eventTimestamp,
            source: "history",
          };
        } else if (status === "SKIPPED") {
          newNotification = {
            id: `history_skipped_${item.id}`,
            type: "warning",
            title: "Schedule Skipped",
            message: buildHistoryMessage(item),
            timestamp: eventTimestamp,
            source: "history",
          };
        }

        if (newNotification) {
          setNotifications((prev) => [newNotification, ...prev]);
        }

        seenHistoryIdsRef.current.add(item.id);
      });
    });

    return () => {
      unsubStatus();
      unsubHistory();
    };
  }, []);

  const refreshAll = async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setRefreshing(false);
  };

  const sortedNotifications = useMemo(() => {
    return [...notifications].sort(
      (a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0)
    );
  }, [notifications]);

  const summary = useMemo(() => {
    const success = sortedNotifications.filter((n) => n.type === "success").length;
    const warning = sortedNotifications.filter((n) => n.type === "warning").length;
    const error = sortedNotifications.filter((n) => n.type === "error").length;
    return { success, warning, error };
  }, [sortedNotifications]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.pageTitle}>Notifications</Text>
          <Text style={styles.pageSubtitle}>
            Alerts for bin full, schedule results, and ESP32 connection status
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrap, { backgroundColor: "#dcfce7" }]}>
              <Feather name="check-circle" size={18} color="#16a34a" />
            </View>
            <Text style={styles.summaryLabel}>Success</Text>
            <Text style={styles.summaryValue}>{summary.success}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrap, { backgroundColor: "#fef3c7" }]}>
              <Ionicons name="warning" size={18} color="#d97706" />
            </View>
            <Text style={styles.summaryLabel}>Warnings</Text>
            <Text style={styles.summaryValue}>{summary.warning}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={[styles.summaryIconWrap, { backgroundColor: "#fee2e2" }]}>
              <Ionicons name="close-circle" size={18} color="#dc2626" />
            </View>
            <Text style={styles.summaryLabel}>Errors</Text>
            <Text style={styles.summaryValue}>{summary.error}</Text>
          </View>
        </View>

        <View style={styles.liveStatusCard}>
          <View style={styles.liveStatusHeader}>
            <Text style={styles.sectionTitle}>Live Status</Text>
            <MaterialCommunityIcons name="bell-outline" size={20} color="#64748b" />
          </View>

          <View style={styles.liveStatusRow}>
            <Text style={styles.liveLabel}>ESP32</Text>
            <Text
              style={[
                styles.liveValue,
                { color: statusData?.wifiConnected ? "#16a34a" : "#dc2626" },
              ]}
            >
              {statusData?.wifiConnected ? "Connected" : "Disconnected"}
            </Text>
          </View>

          <View style={styles.liveStatusRow}>
            <Text style={styles.liveLabel}>Bin Status</Text>
            <Text
              style={[
                styles.liveValue,
                { color: statusData?.loadCell?.binFull ? "#d97706" : "#16a34a" },
              ]}
            >
              {statusData?.loadCell?.binFull ? "Full" : "Normal"}
            </Text>
          </View>

          <View style={[styles.liveStatusRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.liveLabel}>Current Weight</Text>
            <Text style={styles.liveValue}>
              {Number(statusData?.loadCell?.weightGrams ?? 0).toFixed(0)} g
            </Text>
          </View>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Recent Notifications</Text>
          <TouchableOpacity
            onPress={() => setNotifications([])}
            style={styles.clearButton}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        ) : sortedNotifications.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="notifications-off-outline" size={28} color="#64748b" />
            </View>
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySub}>
              New alerts will appear here when the device connects, disconnects,
              the bin becomes full, or schedules finish.
            </Text>
          </View>
        ) : (
          sortedNotifications.map((item) => (
            <View key={item.id} style={styles.notificationCard}>
              <NotificationIcon type={item.type} />

              <View style={styles.notificationBody}>
                <View style={styles.notificationTopRow}>
                  <Text style={styles.notificationTitle}>{item.title}</Text>
                </View>

                <Text style={styles.notificationMessage}>{item.message}</Text>

                <View style={styles.notificationFooter}>
                  <Text style={styles.notificationSource}>
                    {item.source === "history"
                      ? "Schedule"
                      : item.source === "status"
                      ? "Device"
                      : "System"}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 24 }} />
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  summaryCard: {
    width: "31.5%",
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  summaryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  liveStatusCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  liveStatusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  liveStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  liveLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },
  liveValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  clearButton: {
    backgroundColor: "#eef2ff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButtonText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
  },
  loadingCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  loadingText: {
    marginTop: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  emptySub: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#64748b",
    textAlign: "center",
  },
  notificationCard: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  notificationIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  notificationBody: {
    flex: 1,
  },
  notificationTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  notificationTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },
  notificationTime: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
  },
  notificationMessage: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
  },
  notificationFooter: {
    marginTop: 10,
    flexDirection: "row",
  },
  notificationSource: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
});