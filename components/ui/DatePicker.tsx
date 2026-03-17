import {
  View,
  StyleSheet,
  Platform,
  Modal,
  TouchableOpacity,
} from "react-native";
import { Button, Text } from "react-native-paper";
import AntDesign from "@expo/vector-icons/AntDesign";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useState } from "react";

type DatePickerProps = {
  mode: "date" | "time";
  value: Date | null;
  onChange: (date: Date) => void;
};

export default function DatePicker({ mode, value, onChange }: DatePickerProps) {
  const [visible, setVisible] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value || new Date());

  const formatValue = () => {
    if (value instanceof Date && !isNaN(value.getTime())) {
      if (mode === "date") {
        return value.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      } else {
        return value.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
    return mode === "date" ? "Select date" : "Select time";
  };

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      if (event.type !== "dismissed" && selectedDate) {
        onChange(selectedDate);
      }
      setVisible(false);
    } else {
      // iOS updates as user scrolls
      if (selectedDate) setTempDate(selectedDate);
    }
  };

  const confirmIOS = () => {
    onChange(tempDate);
    setVisible(false);
  };

  return (
    <View>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        className="flex-row w-full items-center justify-between border border-gray-300 rounded-lg px-3 py-4"
      >
        <Text style={styles.text}>{formatValue()}</Text>
        <AntDesign name="down" size={14} color="gray" style={styles.icon} />
      </TouchableOpacity>

      {/* ANDROID → native picker directly */}
      {visible && Platform.OS === "android" && (
        <DateTimePicker
          value={value || new Date()}
          mode={mode}
          themeVariant="light"
          accentColor="blue"
          display="default"
          onChange={handleChange}
        />
      )}

      {/* IOS → wrapped in Modal */}
      {Platform.OS === "ios" && (
        <Modal visible={visible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent} className="items-center">
              <DateTimePicker
                value={tempDate}
                mode={mode}
                display="spinner"
                onChange={handleChange}
                themeVariant="light"
                accentColor="blue"
              />
              <View style={styles.modalButtons}>
                <Button onPress={() => setVisible(false)}>Cancel</Button>
                <Button onPress={confirmIOS}>Confirm</Button>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderColor: "#9ca3af",
    borderRadius: 5,
    justifyContent: "space-between",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  text: {
    flex: 1,
    textAlign: "left",
    fontSize: 16,
  },
  icon: {
    marginLeft: 10,
    alignSelf: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "white",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "center",
    padding: 10,
  },
});
