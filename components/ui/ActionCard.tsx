import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import React from "react";
import { globalStyles } from "@/styles/globalStyle";
import { RelativePathString, useNavigation, useRouter } from "expo-router";

type ActionCardProps = {
  children: React.ReactNode;
  className?: string;
  path: string;
  widthFull?: boolean;
  onPress?: () => void;
};

const { width } = Dimensions.get("window");

export default function ActionCard({
  children,
  className,
  path,
  widthFull,
  onPress,
}: ActionCardProps) {
  const router = useRouter();

  const handleRouting = (path: RelativePathString) => {
    if (path) router.push(path);
  };

  return (
    <TouchableOpacity
      onPress={() => handleRouting(path as RelativePathString)}
      onPressIn={onPress}
      className={`items-center justify-center gap-3 p-4 rounded-xl bg-white ${className}`}
      style={[
        globalStyles.card,
        { width: widthFull ? "100%" : (width - 52) / 2 },
      ]}
    >
      {children}
    </TouchableOpacity>
  );
}
