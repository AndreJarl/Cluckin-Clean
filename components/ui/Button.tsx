import { View, Text, TouchableOpacity } from "react-native";
import React from "react";

type ButtonProps = {
  children: React.ReactNode;
  className: string;
  onPress: (title: string) => void;
  title: string;
};

export default function Button({
  children,
  className,
  onPress,
  title,
}: ButtonProps) {
  return (
    <TouchableOpacity
      className={`rounded-lg px-5 py-3`}
      style={{ backgroundColor: className }}
      onPress={() => onPress(title)}
    >
      {children}
    </TouchableOpacity>
  );
}
