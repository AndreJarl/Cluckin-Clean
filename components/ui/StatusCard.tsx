import { View, Text } from "react-native";
import React from "react";
import { globalStyles } from "@/styles/globalStyle";

type StatusCardProps = {
  children: React.ReactNode;
  className?: string;
};

export default function StatusCard({ children, className }: StatusCardProps) {
  return (
    <View
      className={` ${className ? className : "bg-white rounded-lg px-5 py-3 flex gap-5"}`}
      style={globalStyles.card}
    >
      {children}
    </View>
  );
}
