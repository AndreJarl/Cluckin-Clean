import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type ScheduleItem = {
  id: string;
  scheduleId?: string;
  date: string;
  title: string;
  hour: string;
  minute: string;
  duration: string;
  mode: "AUTO";
  enabled: boolean;
  status: "PENDING";
  createdAt?: any;
};

type HistoryItem = {
  id: string;
  scheduleId?: string;
  date: string;
  title: string;
  hour: string;
  minute: string;
  duration: string;
  mode?: "AUTO";
  status: "EXECUTED" | "FAILED" | "SKIPPED";
  executedAt?: any;
};

const DEVICE_ID = "device_001";

function pad2(value: string | number) {
  return String(value).padStart(2, "0");
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function monthLabel(year: number, month: number) {
  return new Date(year, month).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function convertTo24Hour(hour12: string, minute: string, period: "AM" | "PM") {
  let h = Number(hour12);

  if (h < 1) h = 1;
  if (h > 12) h = 12;

  const m = Math.min(59, Math.max(0, Number(minute) || 0));

  if (period === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  return {
    hour24: String(h).padStart(2, "0"),
    minute24: String(m).padStart(2, "0"),
  };
}

function formatTo12Hour(hour24: string, minute: string) {
  let h = Number(hour24);
  const m = String(minute).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";

  h = h % 12;
  if (h === 0) h = 12;

  return `${h}:${m} ${period}`;
}

function buildScheduleDateTime(
  selectedDate: string,
  hour12: string,
  minute: string,
  period: "AM" | "PM"
) {
  const { hour24, minute24 } = convertTo24Hour(hour12, minute, period);
  const [year, month, day] = selectedDate.split("-").map(Number);

  return new Date(year, month - 1, day, Number(hour24), Number(minute24), 0, 0);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function makeScheduleId(date: string, hour24: string, minute24: string) {
  return `schedule_${date}_${hour24}${minute24}_${Date.now()}`;
}

export default function ScheduleScreen() {
  const now = new Date();
  const today = startOfDay(now);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const todayString = formatDate(
    currentYear,
    currentMonth,
    today.getDate()
  );

  const [selectedDate, setSelectedDate] = useState(todayString);
  const [activeTab, setActiveTab] = useState<"saved" | "history">("saved");

  const [modalVisible, setModalVisible] = useState(false);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [title, setTitle] = useState("");
  const [hour12, setHour12] = useState("6");
  const [minute, setMinute] = useState("00");
  const [period, setPeriod] = useState<"AM" | "PM">("AM");
  const [duration, setDuration] = useState("10");

  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const schedulesRef = collection(db, "devices", DEVICE_ID, "schedules");
    const schedulesQuery = query(schedulesRef, orderBy("date", "asc"));

    const unsubSchedules = onSnapshot(
      schedulesQuery,
      (snapshot) => {
        const next: ScheduleItem[] = snapshot.docs.map((item) => {
          const data = item.data() as Omit<ScheduleItem, "id">;
          return { id: item.id, ...data };
        });
        setSchedules(next);
        setLoadingSchedules(false);
      },
      (error) => {
        console.error("Schedules listener error:", error);
        setLoadingSchedules(false);
        Alert.alert("Error", "Failed to load schedules.");
      }
    );

    const historyRef = collection(db, "devices", DEVICE_ID, "history");
    const historyQuery = query(historyRef, orderBy("date", "desc"));

    const unsubHistory = onSnapshot(
      historyQuery,
      (snapshot) => {
        const next: HistoryItem[] = snapshot.docs.map((item) => {
          const data = item.data() as Omit<HistoryItem, "id">;
          return { id: item.id, ...data };
        });
        setHistory(next);
        setLoadingHistory(false);
      },
      (error) => {
        console.error("History listener error:", error);
        setLoadingHistory(false);
        Alert.alert("Error", "Failed to load history.");
      }
    );

    return () => {
      unsubSchedules();
      unsubHistory();
    };
  }, []);

  const refreshAll = async () => {
    try {
      setRefreshing(true);

      const schedulesRef = collection(db, "devices", DEVICE_ID, "schedules");
      const schedulesQuery = query(schedulesRef, orderBy("date", "asc"));
      const schedulesSnap = await getDocs(schedulesQuery);
      setSchedules(
        schedulesSnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<ScheduleItem, "id">),
        }))
      );

      const historyRef = collection(db, "devices", DEVICE_ID, "history");
      const historyQuery = query(historyRef, orderBy("date", "desc"));
      const historySnap = await getDocs(historyQuery);
      setHistory(
        historySnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<HistoryItem, "id">),
        }))
      );
    } catch (error) {
      console.error("Refresh error:", error);
      Alert.alert("Error", "Failed to refresh data.");
    } finally {
      setRefreshing(false);
    }
  };

  const shadowStyle =
    Platform.OS === "ios"
      ? {
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
        }
      : { elevation: 4 };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [daysInMonth, firstDay]);

  const schedulesForSelectedDate = useMemo(() => {
    return schedules
      .filter((item) => item.date === selectedDate)
      .sort((a, b) => {
        const aTime = Number(a.hour) * 60 + Number(a.minute);
        const bTime = Number(b.hour) * 60 + Number(b.minute);
        return aTime - bTime;
      });
  }, [schedules, selectedDate]);

  const historyForSelectedDate = useMemo(() => {
    return history
      .filter((item) => item.date === selectedDate)
      .sort((a, b) => {
        const aTime = Number(a.hour) * 60 + Number(a.minute);
        const bTime = Number(b.hour) * 60 + Number(b.minute);
        return aTime - bTime;
      });
  }, [history, selectedDate]);

  const scheduledDates = useMemo(() => {
    return new Set(
      schedules
        .filter((item) => {
          const [year, month] = item.date.split("-").map(Number);
          return year === currentYear && month === currentMonth + 1;
        })
        .map((item) => item.date)
    );
  }, [schedules, currentYear, currentMonth]);

  const historyDates = useMemo(() => {
    return new Set(
      history
        .filter((item) => {
          const [year, month] = item.date.split("-").map(Number);
          return year === currentYear && month === currentMonth + 1;
        })
        .map((item) => item.date)
    );
  }, [history, currentYear, currentMonth]);

  const timeValidation = useMemo(() => {
    const rawHour = Number(hour12);
    const rawMinute = Number(minute);

    if (!hour12 || Number.isNaN(rawHour) || rawHour < 1 || rawHour > 12) {
      return { invalid: true, message: "Hour must be between 1 and 12." };
    }

    if (!minute || Number.isNaN(rawMinute) || rawMinute < 0 || rawMinute > 59) {
      return { invalid: true, message: "Minute must be between 00 and 59." };
    }

    const scheduledAt = buildScheduleDateTime(selectedDate, hour12, minute, period);
    const current = new Date();

    if (scheduledAt.getTime() <= current.getTime()) {
      return { invalid: true, message: "You cannot set a schedule in the past." };
    }

    return { invalid: false, message: "" };
  }, [selectedDate, hour12, minute, period]);

  const openModal = () => {
    setTitle("");
    setHour12("6");
    setMinute("00");
    setPeriod("AM");
    setDuration("10");
    setModalVisible(true);
  };

  const saveSchedule = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter a schedule title.");
      return;
    }

    if (timeValidation.invalid) {
      Alert.alert("Invalid time", timeValidation.message);
      return;
    }

    const safeDuration = Math.max(1, Number(duration) || 1);
    const { hour24, minute24 } = convertTo24Hour(hour12, minute, period);
    const scheduleId = makeScheduleId(selectedDate, hour24, minute24);

    try {
      setSaving(true);

      await setDoc(doc(db, "devices", DEVICE_ID, "schedules", scheduleId), {
        scheduleId,
        title: title.trim(),
        date: selectedDate,
        hour: hour24,
        minute: minute24,
        duration: String(safeDuration),
        mode: "AUTO",
        enabled: true,
        status: "PENDING",
        createdAt: Date.now(),
      });

      setModalVisible(false);
      setActiveTab("saved");
    } catch (error) {
      console.error("Save schedule error:", error);
      Alert.alert("Error", "Failed to save schedule.");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (id: string, currentValue: boolean) => {
    try {
      await updateDoc(doc(db, "devices", DEVICE_ID, "schedules", id), {
        enabled: !currentValue,
      });
    } catch (error) {
      console.error("Toggle schedule error:", error);
      Alert.alert("Error", "Failed to update schedule.");
    }
  };

  const deleteScheduleItem = async (id: string) => {
    try {
      await deleteDoc(doc(db, "devices", DEVICE_ID, "schedules", id));
    } catch (error) {
      console.error("Delete schedule error:", error);
      Alert.alert("Error", "Failed to delete schedule.");
    }
  };

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <SafeAreaView className="flex-1 bg-slate-50">
      <View className="flex-1">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
          }
        >
          <View className="px-4 pt-3">
            <View className="mb-5 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
                  Schedule Planner
                </Text>
                <Text className="mt-1 text-3xl font-extrabold text-slate-900">
                  Cleaning Schedule
                </Text>
                <Text className="mt-2 text-sm leading-5 text-slate-500">
                  Saved schedules and executed history for this month.
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={openModal}
                className="h-12 w-12 items-center justify-center rounded-2xl bg-slate-900"
              >
                <Feather name="plus" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View className="rounded-[28px] bg-white p-4" style={shadowStyle}>
              <View className="mb-4 items-center">
                <Text className="text-lg font-extrabold text-slate-900">
                  {monthLabel(currentYear, currentMonth)}
                </Text>
              </View>

              <View className="mb-2 flex-row justify-between">
                {weekdayLabels.map((label) => (
                  <View key={label} className="w-[13.5%] items-center">
                    <Text className="text-xs font-bold text-slate-400">{label}</Text>
                  </View>
                ))}
              </View>

              <View className="flex-row flex-wrap justify-between">
                {calendarCells.map((day, index) => {
                  if (!day) {
                    return <View key={`empty-${index}`} className="mb-2 h-14 w-[13.5%]" />;
                  }

                  const dateString = formatDate(currentYear, currentMonth, day);
                  const isSelected = selectedDate === dateString;
                  const hasSchedule = scheduledDates.has(dateString);
                  const hasHistory = historyDates.has(dateString);
                  const isTodayCell = dateString === todayString;
                  const cellDate = new Date(currentYear, currentMonth, day);
                  const isPastDate = startOfDay(cellDate) < today;

                  return (
                    <Pressable
                      key={dateString}
                      disabled={isPastDate}
                      onPress={() => setSelectedDate(dateString)}
                      className={`mb-2 h-14 w-[13.5%] items-center justify-center rounded-2xl ${
                        isPastDate
                          ? "bg-slate-50"
                          : isSelected
                            ? "bg-slate-900"
                            : "bg-slate-50"
                      }`}
                      style={{ opacity: isPastDate ? 0.45 : 1 }}
                    >
                      <Text
                        className={`text-sm font-bold ${
                          isPastDate
                            ? "text-slate-300"
                            : isSelected
                              ? "text-white"
                              : isTodayCell
                                ? "text-blue-600"
                                : "text-slate-800"
                        }`}
                      >
                        {day}
                      </Text>

                      <View className="mt-1 flex-row gap-1">
                        {hasSchedule && !isPastDate ? (
                          <View
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSelected ? "bg-white" : "bg-blue-500"
                            }`}
                          />
                        ) : null}
                        {hasHistory && !isPastDate ? (
                          <View
                            className={`h-1.5 w-1.5 rounded-full ${
                              isSelected ? "bg-white" : "bg-emerald-500"
                            }`}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="mt-2 text-xs text-slate-400">
                Blue = saved schedule, green = execution history.
              </Text>
            </View>

            <View className="mt-5 flex-row gap-3">
              <View className="flex-1 rounded-3xl bg-white p-4" style={shadowStyle}>
                <View className="flex-row items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-blue-50">
                    <Ionicons name="calendar-outline" size={20} color="#2563eb" />
                  </View>
                  <View className="ml-3">
                    <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Selected Date
                    </Text>
                    <Text className="mt-1 text-base font-extrabold text-slate-900">
                      {selectedDate}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="flex-1 rounded-3xl bg-white p-4" style={shadowStyle}>
                <View className="flex-row items-center">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50">
                    <MaterialCommunityIcons
                      name="clock-check-outline"
                      size={20}
                      color="#10b981"
                    />
                  </View>
                  <View className="ml-3">
                    <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      History
                    </Text>
                    <Text className="mt-1 text-base font-extrabold text-slate-900">
                      {historyForSelectedDate.length} item
                      {historyForSelectedDate.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="mt-6 rounded-2xl bg-slate-200 p-1">
              <View className="flex-row">
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setActiveTab("saved")}
                  className={`flex-1 rounded-2xl py-3 ${
                    activeTab === "saved" ? "bg-white" : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`text-center text-sm font-extrabold ${
                      activeTab === "saved" ? "text-slate-900" : "text-slate-500"
                    }`}
                  >
                    Saved Schedules
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setActiveTab("history")}
                  className={`flex-1 rounded-2xl py-3 ${
                    activeTab === "history" ? "bg-white" : "bg-transparent"
                  }`}
                >
                  <Text
                    className={`text-center text-sm font-extrabold ${
                      activeTab === "history" ? "text-slate-900" : "text-slate-500"
                    }`}
                  >
                    History
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {activeTab === "saved" ? (
              <View className="mt-4">
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
                    Saved schedules for {selectedDate}
                  </Text>
                  <TouchableOpacity onPress={openModal}>
                    <Text className="text-sm font-bold text-blue-600">Add Schedule</Text>
                  </TouchableOpacity>
                </View>

                {loadingSchedules ? (
                  <View
                    className="items-center rounded-[28px] bg-white px-5 py-10"
                    style={shadowStyle}
                  >
                    <ActivityIndicator size="large" color="#2563eb" />
                    <Text className="mt-4 text-sm font-semibold text-slate-500">
                      Loading schedules...
                    </Text>
                  </View>
                ) : schedulesForSelectedDate.length === 0 ? (
                  <View
                    className="items-center rounded-[28px] bg-white px-5 py-10"
                    style={shadowStyle}
                  >
                    <View className="h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                      <Ionicons name="calendar-clear-outline" size={28} color="#64748b" />
                    </View>
                    <Text className="mt-4 text-lg font-extrabold text-slate-900">
                      No saved schedules
                    </Text>
                    <Text className="mt-2 text-center text-sm leading-6 text-slate-500">
                      Add a cleaning schedule for this selected date.
                    </Text>
                  </View>
                ) : (
                  schedulesForSelectedDate.map((item) => (
                    <View
                      key={item.id}
                      className="mb-4 rounded-[28px] bg-white p-4"
                      style={shadowStyle}
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <View className="flex-row items-center">
                            <View
                              className={`mr-2 h-2.5 w-2.5 rounded-full ${
                                item.enabled ? "bg-emerald-500" : "bg-slate-300"
                              }`}
                            />
                            <Text className="text-lg font-extrabold text-slate-900">
                              {item.title}
                            </Text>
                          </View>

                          <Text className="mt-2 text-xs text-slate-400">
                            ID: {item.scheduleId || item.id}
                          </Text>

                          <View className="mt-3 flex-row flex-wrap gap-2">
                            <View className="rounded-full bg-slate-100 px-3 py-1.5">
                              <Text className="text-xs font-bold text-slate-700">
                                {formatTo12Hour(item.hour, item.minute)}
                              </Text>
                            </View>

                            <View className="rounded-full bg-blue-50 px-3 py-1.5">
                              <Text className="text-xs font-bold text-blue-700">AUTO</Text>
                            </View>

                            <View className="rounded-full bg-amber-50 px-3 py-1.5">
                              <Text className="text-xs font-bold text-amber-700">
                                {item.duration} min
                              </Text>
                            </View>

                            <View className="rounded-full bg-slate-100 px-3 py-1.5">
                              <Text className="text-xs font-bold text-slate-700">
                                {item.status}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => toggleEnabled(item.id, item.enabled)}
                          className={`rounded-full px-3 py-2 ${
                            item.enabled ? "bg-emerald-50" : "bg-slate-100"
                          }`}
                        >
                          <Text
                            className={`text-xs font-extrabold ${
                              item.enabled ? "text-emerald-700" : "text-slate-600"
                            }`}
                          >
                            {item.enabled ? "Enabled" : "Disabled"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View className="mt-4 flex-row items-center justify-between border-t border-slate-100 pt-4">
                        <Text className="text-sm text-slate-500">
                          Runs on <Text className="font-bold text-slate-700">{item.date}</Text>
                        </Text>

                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => deleteScheduleItem(item.id)}
                          className="flex-row items-center rounded-full bg-red-50 px-3 py-2"
                        >
                          <Feather name="trash-2" size={14} color="#dc2626" />
                          <Text className="ml-2 text-xs font-bold text-red-600">
                            Delete
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : (
              <View className="mt-4">
                <View className="mb-3">
                  <Text className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
                    History for {selectedDate}
                  </Text>
                </View>

                {loadingHistory ? (
                  <View
                    className="items-center rounded-[28px] bg-white px-5 py-10"
                    style={shadowStyle}
                  >
                    <ActivityIndicator size="large" color="#10b981" />
                    <Text className="mt-4 text-sm font-semibold text-slate-500">
                      Loading history...
                    </Text>
                  </View>
                ) : historyForSelectedDate.length === 0 ? (
                  <View
                    className="items-center rounded-[28px] bg-white px-5 py-10"
                    style={shadowStyle}
                  >
                    <View className="h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                      <MaterialCommunityIcons
                        name="history"
                        size={28}
                        color="#64748b"
                      />
                    </View>
                    <Text className="mt-4 text-lg font-extrabold text-slate-900">
                      No history yet
                    </Text>
                    <Text className="mt-2 text-center text-sm leading-6 text-slate-500">
                      Executed schedules from the ESP will appear here.
                    </Text>
                  </View>
                ) : (
                  historyForSelectedDate.map((item) => (
                    <View
                      key={item.id}
                      className="mb-4 rounded-[28px] bg-white p-4"
                      style={shadowStyle}
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="text-lg font-extrabold text-slate-900">
                            {item.title}
                          </Text>

                          <Text className="mt-2 text-xs text-slate-400">
                            ID: {item.scheduleId || item.id}
                          </Text>

                          <View className="mt-3 flex-row flex-wrap gap-2">
                            <View className="rounded-full bg-slate-100 px-3 py-1.5">
                              <Text className="text-xs font-bold text-slate-700">
                                {formatTo12Hour(item.hour, item.minute)}
                              </Text>
                            </View>

                            <View
                              className={`rounded-full px-3 py-1.5 ${
                                item.status === "EXECUTED"
                                  ? "bg-emerald-50"
                                  : item.status === "FAILED"
                                    ? "bg-red-50"
                                    : "bg-amber-50"
                              }`}
                            >
                              <Text
                                className={`text-xs font-bold ${
                                  item.status === "EXECUTED"
                                    ? "text-emerald-700"
                                    : item.status === "FAILED"
                                      ? "text-red-600"
                                      : "text-amber-700"
                                }`}
                              >
                                {item.status}
                              </Text>
                            </View>

                            <View className="rounded-full bg-blue-50 px-3 py-1.5">
                              <Text className="text-xs font-bold text-blue-700">
                                {item.duration} min
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View className="rounded-full bg-slate-100 px-3 py-2">
                          <Text className="text-xs font-extrabold text-slate-600">
                            Done
                          </Text>
                        </View>
                      </View>

                      <View className="mt-4 border-t border-slate-100 pt-4">
                        <Text className="text-sm text-slate-500">
                          Executed on{" "}
                          <Text className="font-bold text-slate-700">{item.date}</Text>
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        </ScrollView>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={openModal}
          className="absolute bottom-6 right-5 h-16 w-16 items-center justify-center rounded-full bg-slate-900"
          style={shadowStyle}
        >
          <Feather name="plus" size={26} color="#fff" />
        </TouchableOpacity>

        <Modal visible={modalVisible} animationType="slide" transparent>
          <View className="flex-1 justify-end bg-black/40">
            <View className="rounded-t-[32px] bg-white px-5 pb-8 pt-4">
              <View className="mb-4 items-center">
                <View className="h-1.5 w-14 rounded-full bg-slate-300" />
              </View>

              <View className="mb-5 flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
                    New Schedule
                  </Text>
                  <Text className="mt-1 text-2xl font-extrabold text-slate-900">
                    Add cleaning time
                  </Text>
                  <Text className="mt-2 text-sm leading-5 text-slate-500">
                    Create a schedule for <Text className="font-bold">{selectedDate}</Text>.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  className="h-11 w-11 items-center justify-center rounded-2xl bg-slate-100"
                >
                  <Ionicons name="close" size={22} color="#0f172a" />
                </TouchableOpacity>
              </View>

              <View className="mb-4">
                <Text className="mb-2 text-sm font-bold text-slate-700">Title</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Morning cleaning"
                  placeholderTextColor="#94a3b8"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900"
                />
              </View>

              <View className="mb-4">
                <Text className="mb-2 text-sm font-bold text-slate-700">Time</Text>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <TextInput
                      value={hour12}
                      onChangeText={setHour12}
                      keyboardType="number-pad"
                      placeholder="6"
                      placeholderTextColor="#94a3b8"
                      className={`rounded-2xl border px-4 py-4 text-base ${
                        timeValidation.invalid
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-slate-200 bg-slate-50 text-slate-900"
                      }`}
                    />
                  </View>

                  <View className="w-[26%]">
                    <TextInput
                      value={minute}
                      onChangeText={setMinute}
                      keyboardType="number-pad"
                      placeholder="00"
                      placeholderTextColor="#94a3b8"
                      className={`rounded-2xl border px-4 py-4 text-base ${
                        timeValidation.invalid
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-slate-200 bg-slate-50 text-slate-900"
                      }`}
                    />
                  </View>

                  <View className="w-[28%] flex-row overflow-hidden rounded-2xl bg-slate-100">
                    <Pressable
                      onPress={() => setPeriod("AM")}
                      className={`flex-1 items-center justify-center py-4 ${
                        period === "AM" ? "bg-slate-900" : "bg-slate-100"
                      }`}
                    >
                      <Text
                        className={`text-sm font-extrabold ${
                          period === "AM" ? "text-white" : "text-slate-700"
                        }`}
                      >
                        AM
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() => setPeriod("PM")}
                      className={`flex-1 items-center justify-center py-4 ${
                        period === "PM" ? "bg-slate-900" : "bg-slate-100"
                      }`}
                    >
                      <Text
                        className={`text-sm font-extrabold ${
                          period === "PM" ? "text-white" : "text-slate-700"
                        }`}
                      >
                        PM
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {timeValidation.invalid ? (
                  <Text className="mt-2 text-xs font-semibold text-red-500">
                    {timeValidation.message}
                  </Text>
                ) : (
                  <Text className="mt-2 text-xs text-slate-400">
                    Example: 6:30 PM
                  </Text>
                )}
              </View>

              <View className="mb-6">
                <Text className="mb-2 text-sm font-bold text-slate-700">
                  Duration (minutes)
                </Text>
                <TextInput
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="number-pad"
                  placeholder="10"
                  placeholderTextColor="#94a3b8"
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-base text-slate-900"
                />
              </View>

              <View className="flex-row gap-3">
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setModalVisible(false)}
                  className="flex-1 items-center rounded-2xl bg-slate-100 py-4"
                >
                  <Text className="text-sm font-extrabold text-slate-700">
                    Cancel
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={saveSchedule}
                  disabled={saving || timeValidation.invalid}
                  className={`flex-1 items-center rounded-2xl py-4 ${
                    saving || timeValidation.invalid ? "bg-blue-400" : "bg-blue-600"
                  }`}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-sm font-extrabold text-white">
                      Save Schedule
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}