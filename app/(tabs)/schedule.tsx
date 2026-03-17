import { Feather, FontAwesome5 } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import dayjs from "dayjs";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { useBleCommands } from "@/providers/ble/useBleCommands";
import { useBleSchedules } from "@/providers/ble/useBleSchedules";
import { globalStyles } from "@/styles/globalStyle";

type FormState = {
  id: number | null;
  enabled: boolean;
  repeatDaily: boolean;
  selectedDate: Date;
  durationSec: string;
};

function createDefaultScheduleDate() {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  return date;
}

function formatDisplayTime(date: Date) {
  return dayjs(date).format("h:mm A");
}

function formatDisplayDate(date: Date) {
  return dayjs(date).format("MMMM D, YYYY");
}

function buildDateFromSchedule(schedule: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  repeatDaily: boolean;
}) {
  const now = new Date();
  const hour = Number(schedule.hour) || 0;
  const minute = Number(schedule.minute) || 0;

  if (schedule.repeatDaily) {
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );
  }

  return new Date(
    Number(schedule.year) || now.getFullYear(),
    Math.max((Number(schedule.month) || 1) - 1, 0),
    Math.max(Number(schedule.day) || 1, 1),
    hour,
    minute,
    0,
    0
  );
}

export default function Schedule() {
  const { isConnected, lastEvent } = useBleCommands();
  const {
    schedules,
    getSchedules,
    addSchedule,
    editSchedule,
    deleteSchedule,
    clearSchedules,
  } = useBleSchedules();

  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [formData, setFormData] = useState<FormState>({
    id: null,
    enabled: true,
    repeatDaily: true,
    selectedDate: createDefaultScheduleDate(),
    durationSec: "10",
  });

  const [errors, setErrors] = useState({
    durationSec: "",
    selectedDate: "",
  });

  useEffect(() => {
    if (!isConnected) return;

    getSchedules().catch((e: any) => {
      console.log("getSchedules error:", e);
    });
  }, [isConnected, getSchedules]);

  useEffect(() => {
    console.log("SCHEDULES from ESP =>", schedules);
    schedules.forEach((item) => {
      const displayDate = buildDateFromSchedule(item);
      console.log("SCHEDULE ITEM =>", {
        raw: item,
        displayDate: displayDate.toString(),
        displayHour: displayDate.getHours(),
        displayMinute: displayDate.getMinutes(),
        displayFormatted: dayjs(displayDate).format("YYYY-MM-DD hh:mm:ss A"),
      });
    });
  }, [schedules]);

  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      const aRepeat = a.repeatDaily ? 0 : 1;
      const bRepeat = b.repeatDaily ? 0 : 1;

      if (aRepeat !== bRepeat) return aRepeat - bRepeat;

      const aTime = a.hour * 60 + a.minute;
      const bTime = b.hour * 60 + b.minute;

      if (aTime !== bTime) return aTime - bTime;

      const aDate = new Date(
        a.year || 0,
        Math.max((a.month || 1) - 1, 0),
        a.day || 1
      ).getTime();

      const bDate = new Date(
        b.year || 0,
        Math.max((b.month || 1) - 1, 0),
        b.day || 1
      ).getTime();

      return aDate - bDate;
    });
  }, [schedules]);

  const nextScheduleId = useMemo(() => {
    if (schedules.length === 0) return 1;
    return Math.max(...schedules.map((s) => s.id)) + 1;
  }, [schedules]);

  const resetForm = () => {
    setErrors({
      durationSec: "",
      selectedDate: "",
    });

    const nextDate = createDefaultScheduleDate();
    console.log("RESET FORM default date =>", {
      date: nextDate.toString(),
      hour: nextDate.getHours(),
      minute: nextDate.getMinutes(),
      iso: nextDate.toISOString(),
    });

    setFormData({
      id: null,
      enabled: true,
      repeatDaily: true,
      selectedDate: nextDate,
      durationSec: "10",
    });
  };

  const openNewModal = () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }

    resetForm();
    setFormData((prev) => ({
      ...prev,
      id: nextScheduleId,
    }));
    setModalVisible(true);
  };

  const openEditModal = (item: {
    id: number;
    enabled: boolean;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    repeatDaily: boolean;
    durationMs: number;
  }) => {
    const built = buildDateFromSchedule(item);

    console.log("OPEN EDIT MODAL raw item =>", item);
    console.log("OPEN EDIT MODAL built date =>", {
      date: built.toString(),
      hour: built.getHours(),
      minute: built.getMinutes(),
      formatted: dayjs(built).format("YYYY-MM-DD hh:mm:ss A"),
    });

    setErrors({
      durationSec: "",
      selectedDate: "",
    });

    setFormData({
      id: item.id,
      enabled: item.enabled,
      repeatDaily: item.repeatDaily,
      selectedDate: built,
      durationSec: String(Math.round(item.durationMs / 1000)),
    });

    setModalVisible(true);
  };

  const validateForm = () => {
    let ok = true;

    const nextErrors = {
      durationSec: "",
      selectedDate: "",
    };

    const durationSec = Number(formData.durationSec);

    if (
      formData.durationSec.trim() === "" ||
      Number.isNaN(durationSec) ||
      durationSec < 1 ||
      durationSec > 600
    ) {
      nextErrors.durationSec = "Duration must be from 1 to 600 seconds";
      ok = false;
    }

    if (!formData.repeatDaily && Number.isNaN(formData.selectedDate.getTime())) {
      nextErrors.selectedDate = "Please choose a valid date";
      ok = false;
    }

    setErrors(nextErrors);
    return ok;
  };

  const handleRefresh = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }

    console.log("MANUAL REFRESH schedules requested");

    setRefreshing(true);
    try {
      await getSchedules();
    } catch (e: any) {
      Alert.alert(
        "Schedule Load Failed",
        e?.message ?? "Failed to refresh schedules from ESP32."
      );
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmit = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please connect to the ESP32 first.");
      return;
    }

    if (!validateForm()) return;
    if (formData.id === null) return;

    setSaving(true);
    try {
      const date = new Date(formData.selectedDate);
      date.setSeconds(0);
      date.setMilliseconds(0);

      console.log("HANDLE SUBMIT selectedDate raw =>", formData.selectedDate);
      console.log("HANDLE SUBMIT selectedDate info =>", {
        toString: formData.selectedDate.toString(),
        iso: formData.selectedDate.toISOString(),
        hour: formData.selectedDate.getHours(),
        minute: formData.selectedDate.getMinutes(),
        formatted: dayjs(formData.selectedDate).format("YYYY-MM-DD hh:mm:ss A"),
      });

      console.log("HANDLE SUBMIT normalized date =>", {
        toString: date.toString(),
        iso: date.toISOString(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        formatted: dayjs(date).format("YYYY-MM-DD hh:mm:ss A"),
      });

      const payload = {
        id: formData.id,
        year: formData.repeatDaily ? 0 : date.getFullYear(),
        month: formData.repeatDaily ? 0 : date.getMonth() + 1,
        day: formData.repeatDaily ? 0 : date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
        repeatDaily: formData.repeatDaily,
        enabled: formData.enabled,
        durationMs: Number(formData.durationSec) * 1000,
      };

      console.log("HANDLE SUBMIT payload to send =>", payload);

      const existing = schedules.some((s) => s.id === formData.id);

      console.log("HANDLE SUBMIT existing schedule? =>", existing);

      if (existing) {
        console.log("CALL editSchedule(payload)");
        await editSchedule(payload);
      } else {
        console.log("CALL addSchedule(payload)");
        await addSchedule(payload);
      }

      console.log("WAIT then reload schedules from ESP");
      await new Promise((resolve) => setTimeout(resolve, 300));
      await getSchedules();

      setModalVisible(false);
      Alert.alert("Success", "Schedule saved.");
    } catch (e: any) {
      console.log("HANDLE SUBMIT error =>", e);
      Alert.alert(
        "Save Failed",
        e?.message ?? "Failed to save schedule to ESP32."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert("Delete Schedule", `Remove schedule ID ${id}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!isConnected) {
            Alert.alert("Not Connected", "Please connect to the ESP32 first.");
            return;
          }

          console.log("DELETE schedule id =>", id);

          setDeletingId(id);
          try {
            await deleteSchedule(id);
            await new Promise((resolve) => setTimeout(resolve, 300));
            await getSchedules();
            Alert.alert("Deleted", "Schedule removed from ESP32.");
          } catch (e: any) {
            console.log("DELETE error =>", e);
            Alert.alert(
              "Delete Failed",
              e?.message ?? "Failed to remove schedule from ESP32."
            );
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert("Clear All Schedules", "Remove all schedules from the ESP32?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear All",
        style: "destructive",
        onPress: async () => {
          console.log("CLEAR ALL schedules");
          try {
            await clearSchedules();
            await new Promise((resolve) => setTimeout(resolve, 300));
            await getSchedules();
            Alert.alert("Cleared", "All schedules removed.");
          } catch (e: any) {
            console.log("CLEAR ALL error =>", e);
            Alert.alert(
              "Clear Failed",
              e?.message ?? "Failed to clear schedules."
            );
          }
        },
      },
    ]);
  };

  const onChangeDate = (event: DateTimePickerEvent, selected?: Date) => {
    console.log("DATE PICKER event =>", event.type);
    console.log("DATE PICKER selected raw =>", selected);

    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (event.type !== "set" || !selected) return;

    console.log("DATE PICKER selected info =>", {
      toString: selected.toString(),
      iso: selected.toISOString(),
      year: selected.getFullYear(),
      month: selected.getMonth() + 1,
      day: selected.getDate(),
    });

    setFormData((prev) => {
      const next = new Date(prev.selectedDate);

      next.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate()
      );

      console.log("DATE PICKER merged result =>", {
        previous: prev.selectedDate.toString(),
        next: next.toString(),
        hour: next.getHours(),
        minute: next.getMinutes(),
        formatted: dayjs(next).format("YYYY-MM-DD hh:mm:ss A"),
      });

      return {
        ...prev,
        selectedDate: next,
      };
    });
  };

  const onChangeTime = (event: DateTimePickerEvent, selected?: Date) => {
    console.log("TIME PICKER event =>", event.type);
    console.log("TIME PICKER selected raw =>", selected);

    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }

    if (event.type !== "set" || !selected) return;

    console.log("TIME PICKER selected info =>", {
      toString: selected.toString(),
      iso: selected.toISOString(),
      hour: selected.getHours(),
      minute: selected.getMinutes(),
      formatted: dayjs(selected).format("YYYY-MM-DD hh:mm:ss A"),
    });

    setFormData((prev) => {
      const next = new Date(prev.selectedDate);

      next.setHours(selected.getHours());
      next.setMinutes(selected.getMinutes());
      next.setSeconds(0);
      next.setMilliseconds(0);

      console.log("TIME PICKER merged result =>", {
        previous: prev.selectedDate.toString(),
        next: next.toString(),
        hour: next.getHours(),
        minute: next.getMinutes(),
        formatted: dayjs(next).format("YYYY-MM-DD hh:mm:ss A"),
      });

      return {
        ...prev,
        selectedDate: next,
      };
    });
  };

  const renderEmptyState = () => {
    if (!isConnected) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Feather name="bluetooth" size={32} color="#cbd5e1" />
          </View>
          <Text style={styles.emptyText}>Device not connected</Text>
          <Text style={styles.emptySubText}>
            Connect to the ESP32 to load and manage schedules.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Feather name="calendar" size={32} color="#cbd5e1" />
        </View>
        <Text style={styles.emptyText}>No schedules loaded</Text>
        <Text style={styles.emptySubText}>
          Tap refresh or create a new schedule.
        </Text>
      </View>
    );
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <View style={styles.topBar}>
          <Text style={styles.pageTitle}>Schedules</Text>

          <TouchableOpacity
            style={[styles.refreshBtn, refreshing && { opacity: 0.7 }]}
            onPress={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Feather name="refresh-cw" size={18} color="#2563eb" />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Schedule Mode</Text>
          <Text style={styles.infoText}>
            Create either a daily repeating schedule or a one-time date schedule.
          </Text>
          <Text style={styles.infoText}>Duration limit: 1 to 600 seconds</Text>
          <Text style={styles.infoText}>
            Connection: {isConnected ? "CONNECTED" : "DISCONNECTED"}
          </Text>
          <Text style={styles.infoText}>Last Event: {lastEvent}</Text>
        </View>

        <View style={styles.actionWrap}>
          <TouchableOpacity
            style={[globalStyles.card, styles.newButton]}
            onPress={openNewModal}
          >
            <View style={styles.plusIconWrap}>
              <FontAwesome5 name="plus" size={16} color="white" />
            </View>
            <Text style={styles.newButtonText}>New Schedule</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[globalStyles.card, styles.clearButton]}
            onPress={handleClearAll}
          >
            <View style={styles.clearIconWrap}>
              <Feather name="trash-2" size={16} color="white" />
            </View>
            <Text style={styles.newButtonText}>Clear All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listWrap}>
          <Text style={styles.sectionTitle}>Saved Schedules</Text>

          {sortedSchedules.length > 0
            ? sortedSchedules.map((item) => {
                const displayDate = buildDateFromSchedule(item);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.scheduleCard}
                    activeOpacity={0.9}
                    onPress={() => openEditModal(item)}
                  >
                    <View style={styles.timeBox}>
                      <Text style={styles.timeText}>
                        {dayjs(displayDate).format("h:mm A")}
                      </Text>

                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor: item.enabled ? "#dcfce7" : "#f1f5f9",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: item.enabled ? "#16a34a" : "#64748b" },
                          ]}
                        >
                          {item.enabled ? "ON" : "OFF"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.contentBox}>
                      <Text style={styles.itemTitle}>Schedule ID {item.id}</Text>
                      <Text style={styles.itemType}>
                        {item.repeatDaily
                          ? "Repeats daily"
                          : `${dayjs(displayDate).format("MMMM D, YYYY")}`}
                      </Text>
                      <Text style={styles.itemDesc}>
                        Runs for {Math.round(item.durationMs / 1000)}s
                      </Text>
                    </View>

                    {deletingId === item.id ? (
                      <ActivityIndicator size="small" color="#ef4444" />
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleDelete(item.id)}
                        style={styles.deleteButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="trash-2" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            : renderEmptyState()}
        </View>
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide">
        <SafeAreaProvider>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.header}>
              <Text style={styles.headerText}>
                {formData.id !== null ? `Schedule ${formData.id}` : "Add Schedule"}
              </Text>

              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                disabled={saving}
              >
                <FontAwesome5
                  name="window-close"
                  size={24}
                  color={saving ? "#cbd5e1" : "#64748b"}
                />
              </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{ flex: 1 }}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <ScrollView contentContainerStyle={styles.form}>
                  <Text style={styles.label}>Schedule ID</Text>
                  <View style={styles.readOnlyBox}>
                    <Text style={styles.readOnlyText}>
                      {formData.id !== null ? formData.id : "-"}
                    </Text>
                  </View>

                  <View style={styles.switchRow}>
                    <Text style={styles.labelNoMargin}>Enabled</Text>
                    <Switch
                      value={formData.enabled}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, enabled: value }))
                      }
                      disabled={saving}
                    />
                  </View>

                  <View style={styles.switchRow}>
                    <Text style={styles.labelNoMargin}>Repeat Daily</Text>
                    <Switch
                      value={formData.repeatDaily}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, repeatDaily: value }))
                      }
                      disabled={saving}
                    />
                  </View>

                  {!formData.repeatDaily && (
                    <>
                      <Text style={styles.label}>Date</Text>
                      <TouchableOpacity
                        style={styles.pickerButton}
                        onPress={() => setShowDatePicker(true)}
                        disabled={saving}
                      >
                        <Feather name="calendar" size={18} color="#2563eb" />
                        <Text style={styles.pickerButtonText}>
                          {formatDisplayDate(formData.selectedDate)}
                        </Text>
                      </TouchableOpacity>
                      {!!errors.selectedDate && (
                        <Text style={styles.error}>{errors.selectedDate}</Text>
                      )}
                    </>
                  )}

                  <Text style={styles.label}>Time</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowTimePicker(true)}
                    disabled={saving}
                  >
                    <Feather name="clock" size={18} color="#2563eb" />
                    <Text style={styles.pickerButtonText}>
                      {formatDisplayTime(formData.selectedDate)}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.label}>Duration (seconds)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1 to 600"
                    keyboardType="number-pad"
                    value={formData.durationSec}
                    onChangeText={(t) =>
                      setFormData((prev) => ({ ...prev, durationSec: t }))
                    }
                    editable={!saving}
                  />
                  {!!errors.durationSec && (
                    <Text style={styles.error}>{errors.durationSec}</Text>
                  )}

                  <TouchableOpacity
                    style={[styles.saveButton, saving && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save Schedule</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>

            {showDatePicker && (
              <DateTimePicker
                value={formData.selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onChangeDate}
                minimumDate={new Date()}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={formData.selectedDate}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onChangeTime}
                is24Hour={false}
              />
            )}
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1e293b",
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eff6ff",
  },
  infoCard: {
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: "#f8fafc",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
  },
  actionWrap: {
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 12,
  },
  newButton: {
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  clearButton: {
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  plusIconWrap: {
    padding: 8,
    backgroundColor: "#22c55e",
    borderRadius: 10,
  },
  clearIconWrap: {
    padding: 8,
    backgroundColor: "#ef4444",
    borderRadius: 10,
  },
  newButtonText: {
    fontWeight: "700",
    color: "#1e293b",
  },
  listWrap: {
    paddingHorizontal: 20,
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scheduleCard: {
    flexDirection: "row",
    backgroundColor: "white",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#f1f5f9",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
    }),
  },
  timeBox: {
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#f1f5f9",
    paddingRight: 15,
    marginRight: 15,
    minWidth: 90,
  },
  timeText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1e293b",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  contentBox: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1e293b",
  },
  itemType: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  itemDesc: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 4,
  },
  deleteButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#fef2f2",
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
  },
  emptySubText: {
    fontSize: 14,
    color: "#94a3b8",
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1e293b",
  },
  form: {
    padding: 24,
    gap: 12,
  },
  input: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#1e293b",
  },
  readOnlyBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
  },
  readOnlyText: {
    fontSize: 16,
    color: "#1e293b",
    fontWeight: "700",
  },
  pickerButton: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#1e293b",
    fontWeight: "600",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginTop: 8,
  },
  labelNoMargin: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },
  switchRow: {
    marginTop: 8,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  error: {
    color: "#ef4444",
    fontSize: 12,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#22c55e",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    minHeight: 60,
    shadowColor: "#22c55e",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
});