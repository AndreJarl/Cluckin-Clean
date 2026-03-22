import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { onValue, ref } from "firebase/database";
import { db } from "@/lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoryItem = {
  id: string;
  scheduleId?: string;
  date: string;
  title: string;
  hour: string;
  minute: string;
  duration: string;
  mode?: "AUTO";
  status: "EXECUTED" | "FAILED" | "SKIPPED" | string;
  executedAt?: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_ID = "conveyorCleaner01";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(value: string | number) {
  return String(value).padStart(2, "0");
}

function formatTo12Hour(hour24?: string, minute?: string) {
  if (!hour24 || !minute) return "--";
  let h = Number(hour24);
  const m = String(minute).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${period}`;
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
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

function getUniqueDates(items: HistoryItem[]): string[] {
  const set = new Set<string>();
  items.forEach((i) => { if (i.date) set.add(i.date); });
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusBgClass(status: string) {
  if (status === "EXECUTED") return "bg-emerald-50";
  if (status === "FAILED") return "bg-red-50";
  return "bg-amber-50";
}

function statusTextClass(status: string) {
  if (status === "EXECUTED") return "text-emerald-700";
  if (status === "FAILED") return "text-red-600";
  return "text-amber-700";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HistoryCard({ item, shadowStyle }: { item: HistoryItem; shadowStyle: object }) {
  return (
    <View className="mb-4 rounded-[28px] bg-white p-4" style={shadowStyle}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-lg font-extrabold text-slate-900">{item.title}</Text>

          <Text className="mt-2 text-xs text-slate-400">
            ID: {item.scheduleId || item.id}
          </Text>

          <View className="mt-3 flex-row flex-wrap gap-2">
            <View className="rounded-full bg-slate-100 px-3 py-1.5">
              <Text className="text-xs font-bold text-slate-700">
                {formatTo12Hour(item.hour, item.minute)}
              </Text>
            </View>

            <View className={`rounded-full px-3 py-1.5 ${statusBgClass(item.status)}`}>
              <Text className={`text-xs font-bold ${statusTextClass(item.status)}`}>
                {item.status}
              </Text>
            </View>

            <View className="rounded-full bg-blue-50 px-3 py-1.5">
              <Text className="text-xs font-bold text-blue-700">{item.duration} min</Text>
            </View>

            {item.mode ? (
              <View className="rounded-full bg-slate-100 px-3 py-1.5">
                <Text className="text-xs font-bold text-slate-700">{item.mode}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="rounded-full bg-slate-100 px-3 py-2">
          <Text className="text-xs font-extrabold text-slate-600">Done</Text>
        </View>
      </View>

      <View className="mt-4 border-t border-slate-100 pt-4">
        <Text className="text-sm text-slate-500">
          Executed on{" "}
          <Text className="font-bold text-slate-700">{item.date}</Text>
        </Text>
      </View>
    </View>
  );
}

function DateFilterModal({
  visible,
  dates,
  selected,
  onSelect,
  onClose,
  shadowStyle,
}: {
  visible: boolean;
  dates: string[];
  selected: string;
  onSelect: (d: string) => void;
  onClose: () => void;
  shadowStyle: object;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end bg-black/40">
        <View className="rounded-t-[32px] bg-white px-5 pb-8 pt-4">
          {/* Handle */}
          <View className="mb-4 items-center">
            <View className="h-1.5 w-14 rounded-full bg-slate-300" />
          </View>

          {/* Header */}
          <View className="mb-5 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
                Filter
              </Text>
              <Text className="mt-1 text-2xl font-extrabold text-slate-900">
                Select a Date
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="h-11 w-11 items-center justify-center rounded-2xl bg-slate-100"
            >
              <Ionicons name="close" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {/* All dates option */}
            <TouchableOpacity
              onPress={() => { onSelect(""); onClose(); }}
              className={`mb-2 flex-row items-center justify-between rounded-2xl px-4 py-4 ${
                selected === "" ? "bg-slate-900" : "bg-slate-50"
              }`}
            >
              <Text className={`text-sm font-bold ${selected === "" ? "text-white" : "text-slate-700"}`}>
                All Dates
              </Text>
              {selected === "" && (
                <Ionicons name="checkmark" size={18} color="#fff" />
              )}
            </TouchableOpacity>

            {dates.map((date) => (
              <TouchableOpacity
                key={date}
                onPress={() => { onSelect(date); onClose(); }}
                className={`mb-2 flex-row items-center justify-between rounded-2xl px-4 py-4 ${
                  selected === date ? "bg-slate-900" : "bg-slate-50"
                }`}
              >
                <Text className={`text-sm font-bold ${selected === date ? "text-white" : "text-slate-700"}`}>
                  {formatDisplayDate(date)}
                </Text>
                {selected === date && (
                  <Ionicons name="checkmark" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            ))}

            {dates.length === 0 && (
              <Text className="py-6 text-center text-sm text-slate-400">
                No dates available
              </Text>
            )}
          </ScrollView>

          <TouchableOpacity
            onPress={onClose}
            className="mt-4 items-center rounded-2xl bg-slate-100 py-4"
          >
            <Text className="text-sm font-extrabold text-slate-700">Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AllHistory() {
  const [history, setHistory]           = useState<HistoryItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [showPicker, setShowPicker]     = useState(false);

  const shadowStyle =
    Platform.OS === "ios"
      ? {
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
        }
      : { elevation: 4 };

  useEffect(() => {
    const historyRef = ref(db, `/devices/${DEVICE_ID}/history`);

    const unsub = onValue(
      historyRef,
      (snapshot) => {
        const items = mapObjectToArray<HistoryItem>(snapshot.val()).sort(
          (a, b) => Number(b.executedAt ?? 0) - Number(a.executedAt ?? 0)
        );
        setHistory(items);
        setLoading(false);
      },
      () => {
        setLoading(false);
        Alert.alert("Error", "Failed to load history.");
      }
    );

    return () => unsub();
  }, []);

  const availableDates = useMemo(() => getUniqueDates(history), [history]);

  const filtered = useMemo(() => {
    if (!selectedDate) return history;
    return history.filter((i) => i.date === selectedDate);
  }, [history, selectedDate]);

  const refreshAll = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  };

  // ── Stats ──
  const executedCount = history.filter((i) => i.status === "EXECUTED").length;
  const failedCount   = history.filter((i) => i.status === "FAILED").length;

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
        }
      >
        <View className="px-4 pt-3">

          {/* Header */}
          <View className="mb-5">
            <Text className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
              Conveyor Cleaner 01
            </Text>
            <Text className="mt-1 text-3xl font-extrabold text-slate-900">
              Run History
            </Text>
            <Text className="mt-2 text-sm leading-5 text-slate-500">
              All executed cleaning schedules from the device.
            </Text>
          </View>

          {/* Stats row */}
          <View className="mb-5 flex-row gap-3">
            <View className="flex-1 rounded-3xl bg-white p-4" style={shadowStyle}>
              <View className="flex-row items-center">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50">
                  <MaterialCommunityIcons name="clock-check-outline" size={20} color="#10b981" />
                </View>
                <View className="ml-3">
                  <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Executed
                  </Text>
                  <Text className="mt-1 text-xl font-extrabold text-slate-900">
                    {executedCount}
                  </Text>
                </View>
              </View>
            </View>

            <View className="flex-1 rounded-3xl bg-white p-4" style={shadowStyle}>
              <View className="flex-row items-center">
                <View className="h-11 w-11 items-center justify-center rounded-2xl bg-red-50">
                  <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#ef4444" />
                </View>
                <View className="ml-3">
                  <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Failed
                  </Text>
                  <Text className="mt-1 text-xl font-extrabold text-slate-900">
                    {failedCount}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Filter bar */}
          <View className="mb-5 flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => setShowPicker(true)}
              className="flex-row items-center gap-2 rounded-2xl bg-white px-4 py-3"
              style={shadowStyle}
            >
              <Ionicons name="calendar-outline" size={16} color="#2563eb" />
              <Text className="text-sm font-bold text-slate-700">
                {selectedDate ? formatDisplayDate(selectedDate) : "All Dates"}
              </Text>
              <Ionicons name="chevron-down" size={14} color="#94a3b8" />
            </TouchableOpacity>

            {selectedDate !== "" && (
              <TouchableOpacity
                onPress={() => setSelectedDate("")}
                className="flex-row items-center gap-1 rounded-2xl bg-red-50 px-3 py-3"
              >
                <Ionicons name="close" size={14} color="#dc2626" />
                <Text className="text-xs font-bold text-red-600">Clear</Text>
              </TouchableOpacity>
            )}

            <Text className="ml-auto text-xs font-bold text-slate-400">
              {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {/* List */}
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
              {selectedDate ? `Results for ${formatDisplayDate(selectedDate)}` : "All Records"}
            </Text>
          </View>

          {loading ? (
            <View className="items-center rounded-[28px] bg-white px-5 py-10" style={shadowStyle}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text className="mt-4 text-sm font-semibold text-slate-500">
                Loading history...
              </Text>
            </View>
          ) : filtered.length === 0 ? (
            <View className="items-center rounded-[28px] bg-white px-5 py-10" style={shadowStyle}>
              <View className="h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <MaterialCommunityIcons name="history" size={28} color="#64748b" />
              </View>
              <Text className="mt-4 text-lg font-extrabold text-slate-900">
                No records found
              </Text>
              <Text className="mt-2 text-center text-sm leading-6 text-slate-500">
                {selectedDate
                  ? "Try a different date or clear the filter."
                  : "No run history yet. Executed schedules will appear here."}
              </Text>
            </View>
          ) : (
            filtered.map((item) => (
              <HistoryCard key={item.id} item={item} shadowStyle={shadowStyle} />
            ))
          )}
        </View>
      </ScrollView>

      {/* Date picker modal */}
      <DateFilterModal
        visible={showPicker}
        dates={availableDates}
        selected={selectedDate}
        onSelect={setSelectedDate}
        onClose={() => setShowPicker(false)}
        shadowStyle={shadowStyle}
      />
    </SafeAreaView>
  );
}