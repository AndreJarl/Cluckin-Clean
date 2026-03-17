import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
} from "react-native";
import AntDesign from "@expo/vector-icons/AntDesign";

type DropdownComponentProps = {
  data: { label: string; value: string }[];
  placeholder?: string;
  onChangeValue?: (value: string) => void;
};

const DropdownComponent = ({
  data,
  placeholder = "Select option",
  onChangeValue,
}: DropdownComponentProps) => {
  const [value, setValue] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (item: { label: string; value: string }) => {
    setValue(item.value);
    setIsOpen(false);
    if (onChangeValue) onChangeValue(item.value);
  };

  return (
    <View style={styles.container}>
      {/* Dropdown button */}
      <TouchableOpacity
        style={[styles.dropdown, isOpen && { borderColor: "#3b82f6" }]}
        onPress={() => setIsOpen(true)}
      >
        {/* <AntDesign
          name="safety"
          size={20}
          color={isOpen ? "#3b82f6" : "#6b7280"}
          style={styles.icon}
        /> */}
        <Text style={value ? styles.selectedText : styles.placeholderText}>
          {value
            ? data.find((item) => item.value === value)?.label
            : placeholder}
        </Text>
        <AntDesign
          name={isOpen ? "up" : "down"}
          size={14}
          color="#6b7280"
          style={{ marginLeft: "auto" }}
        />
      </TouchableOpacity>

      {/* Dropdown modal */}
      <Modal visible={isOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
          <View style={styles.modalContent}>
            <FlatList
              data={data}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.item}
                  onPress={() => handleSelect(item)}
                >
                  <Text style={styles.itemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

export default DropdownComponent;

const styles = StyleSheet.create({
  container: {
    backgroundColor: "white",
    paddingVertical: 8,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderColor: "#9ca3af",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
  },
  icon: {
    marginRight: 8,
  },
  placeholderText: {
    fontSize: 16,
    color: "#9ca3af",
  },
  selectedText: {
    fontSize: 16,
    color: "#111827",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 8,
    width: "80%",
    maxHeight: 300,
    elevation: 5,
  },
  item: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  itemText: {
    fontSize: 16,
    color: "#111827",
  },
});
