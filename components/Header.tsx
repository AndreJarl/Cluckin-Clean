import { View, Text, Image, Platform, TouchableOpacity } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { globalStyles } from "@/styles/globalStyle";
import React from "react";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Header() {
  const router = useRouter();
  return (
    <SafeAreaView
      edges={["top"]}
      className={`flex w-full bg-white `}
      style={globalStyles.card}
    >
      <View className="px-5 flex flex-row items-center justify-between">
        <View className="flex flex-row items-center gap-2">
          <Image
            source={require("@/assets/images/ecoChicken.png")}
            className="w-[64px] h-[80px]"
          />
          <View className="flex flex-col leading-tight">
            <Text className="text-xl font-bold">CLUCKING CLEAN</Text>
            <Text className="text-gray-400 font-semibold text-base">
              Poultry Waste Management
            </Text>
          </View>
        </View>
        <TouchableOpacity
          className="px-3 bg-green-400 rounded-full py-3"
          onPress={() => router.push("/notification")}
        >
          <Feather name="bell" size={18} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
