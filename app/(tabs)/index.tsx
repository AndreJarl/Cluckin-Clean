import { Feather, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import MyAccordion from "@/components/ui/Accordion";

export default function HomeScreen() {
  const router = useRouter();

  const [helpVisible, setHelpVisible] = useState(false);
  const [deviceDetailsVisible, setDeviceDetailsVisible] = useState(false);

  // TEMP DATA
  // Later we will replace these with Firebase values
  const isConnected = true;
  const connectionLabel = isConnected ? "Online" : "Offline";
  const connectionColor = isConnected ? "#10b981" : "#ef4444";
  const connectionBg = isConnected ? "#dcfce7" : "#fee2e2";

  const deviceName = "Chicken Cleaner 1";
  const status = "IDLE";
  const mode = "AUTO";
  const weight = 8.4;
  const weightPct = 42;
  const motorDir = "Forward";
  const motorSpeed = 75;
  const rtcTime = "10:24 AM";
  const lastEvent = "System checked successfully. No recent issues detected.";
  const binFullAlert = false;

  const actions = [
    {
      title: "Dashboard",
      sub: "Stats & controls",
      icon: "grid",
      color: "#3b82f6",
      bg: "#dbeafe",
      path: "/dashboard",
    },
    {
      title: "Schedule",
      sub: "Cleaning times",
      icon: "calendar",
      color: "#8b5cf6",
      bg: "#ede9fe",
      path: "/schedule",
    },
    {
      title: "Monitoring",
      sub: "Weight & activity",
      icon: "activity",
      color: "#10b981",
      bg: "#d1fae5",
      path: "/monitoring",
    },
    {
      title: "Notifications",
      sub: "Alerts & events",
      icon: "bell",
      color: "#f59e0b",
      bg: "#fef3c7",
      path: "/notification",
    },
  ];

  const shadowStyle =
    Platform.OS === "ios"
      ? {
          shadowColor: "#0f172a",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
        }
      : { elevation: 4 };

  return (
    <View className="flex-1 bg-slate-50">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        <ImageBackground
          source={require("@/assets/images/barn.jpg")}
          style={{ width: "100%", height: 290 }}
          imageStyle={{ borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }}
        >
          <LinearGradient
            colors={["rgba(15,23,42,0.28)", "rgba(15,23,42,0.86)"]}
            style={{
              flex: 1,
              paddingHorizontal: 20,
              paddingBottom: 28,
              borderBottomLeftRadius: 30,
              borderBottomRightRadius: 30,
              justifyContent: "space-between",
            }}
          >
            <SafeAreaView
              style={{
                paddingTop: Platform.OS === "ios" ? 2 : 16,
                alignItems: "flex-end",
              }}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setDeviceDetailsVisible(true)}
                className="rounded-full bg-white/20 px-4 py-2"
              >
                <Text className="text-sm font-bold text-white">{connectionLabel}</Text>
              </TouchableOpacity>
            </SafeAreaView>

            <View className="pb-2">
              <Text className="text-4xl font-extrabold tracking-tight text-white">
                Hello, Farmer
              </Text>
              <Text className="mt-2 text-[15px] leading-6 text-slate-200">
                Monitor your automatic chicken waste cleaner, schedules, and system activity.
              </Text>
            </View>
          </LinearGradient>
        </ImageBackground>

        <View className="-mt-5 px-4">
          <View className="rounded-3xl bg-white p-5" style={shadowStyle}>
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[12px] font-extrabold uppercase tracking-wider text-slate-400">
                  System Overview
                </Text>
                <Text className="mt-1 text-2xl font-extrabold text-slate-900">
                  {isConnected ? "Device Connected" : "Waiting for Device"}
                </Text>
              </View>

              <View
                className="rounded-full px-3 py-2"
                style={{ backgroundColor: connectionBg }}
              >
                <Text
                  className="text-xs font-extrabold"
                  style={{ color: connectionColor }}
                >
                  {connectionLabel}
                </Text>
              </View>
            </View>

            <View className="mt-5 flex-row justify-between">
              <View className="w-[31.5%] rounded-2xl bg-slate-50 px-3 py-4 items-center">
                <Text className="text-lg font-extrabold text-slate-900">
                  {weight.toFixed(1)} kg
                </Text>
                <Text className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Weight
                </Text>
                <Text className="mt-1 text-center text-[11px] text-slate-400">
                  Current load
                </Text>
              </View>

              <View className="w-[31.5%] rounded-2xl bg-slate-50 px-3 py-4 items-center">
                <Text className="text-lg font-extrabold text-slate-900">
                  {weightPct}%
                </Text>
                <Text className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Fill
                </Text>
                <Text className="mt-1 text-center text-[11px] text-slate-400">
                  Bin level
                </Text>
              </View>

              <View className="w-[31.5%] rounded-2xl bg-slate-50 px-3 py-4 items-center">
                <Text className="text-lg font-extrabold text-slate-900">
                  {mode}
                </Text>
                <Text className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Mode
                </Text>
                <Text className="mt-1 text-center text-[11px] text-slate-400">
                  Operation
                </Text>
              </View>
            </View>

            <View className="flex-row items-center justify-between">


            </View>

            {binFullAlert ? (
              <View className="mt-4 flex-row items-center rounded-2xl bg-red-50 px-3 py-3">
                <Ionicons name="alert-circle" size={18} color="#ef4444" />
                <Text className="ml-2 flex-1 text-[13px] font-bold text-red-600">
                  Bin is nearing full capacity. Please empty it soon.
                </Text>
              </View>
            ) : null}
          </View>

          <View className="mt-6">
            <Text className="mb-4 text-[12px] font-extrabold uppercase tracking-wider text-slate-400">
              Quick Access
            </Text>

            <View className="flex-row justify-between">
              <View className="w-[48%]">
                <Pressable
                  onPress={() => router.push(actions[0].path as any)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                >
                  <View className="mb-4 rounded-3xl bg-white p-4" style={shadowStyle}>
                    <View
                      className="h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: actions[0].bg }}
                    >
                      <Feather
                        name={actions[0].icon as any}
                        size={22}
                        color={actions[0].color}
                      />
                    </View>

                    <Text className="mt-4 text-base font-extrabold text-slate-900">
                      {actions[0].title}
                    </Text>
                    <Text className="mt-1 text-[13px] leading-5 text-slate-500">
                      {actions[0].sub}
                    </Text>

                    <View className="mt-4 flex-row items-center justify-between">
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: actions[0].color }}
                      >
                        Open
                      </Text>
                      <Feather
                        name="arrow-up-right"
                        size={16}
                        color={actions[0].color}
                      />
                    </View>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => router.push(actions[2].path as any)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                >
                  <View className="rounded-3xl bg-white p-4" style={shadowStyle}>
                    <View
                      className="h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: actions[2].bg }}
                    >
                      <Feather
                        name={actions[2].icon as any}
                        size={22}
                        color={actions[2].color}
                      />
                    </View>

                    <Text className="mt-4 text-base font-extrabold text-slate-900">
                      {actions[2].title}
                    </Text>
                    <Text className="mt-1 text-[13px] leading-5 text-slate-500">
                      {actions[2].sub}
                    </Text>

                    <View className="mt-4 flex-row items-center justify-between">
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: actions[2].color }}
                      >
                        Open
                      </Text>
                      <Feather
                        name="arrow-up-right"
                        size={16}
                        color={actions[2].color}
                      />
                    </View>
                  </View>
                </Pressable>
              </View>

              <View className="w-[48%]">
                <Pressable
                  onPress={() => router.push(actions[1].path as any)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                >
                  <View className="mb-4 rounded-3xl bg-white p-4" style={shadowStyle}>
                    <View
                      className="h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: actions[1].bg }}
                    >
                      <Feather
                        name={actions[1].icon as any}
                        size={22}
                        color={actions[1].color}
                      />
                    </View>

                    <Text className="mt-4 text-base font-extrabold text-slate-900">
                      {actions[1].title}
                    </Text>
                    <Text className="mt-1 text-[13px] leading-5 text-slate-500">
                      {actions[1].sub}
                    </Text>

                    <View className="mt-4 flex-row items-center justify-between">
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: actions[1].color }}
                      >
                        Open
                      </Text>
                      <Feather
                        name="arrow-up-right"
                        size={16}
                        color={actions[1].color}
                      />
                    </View>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => router.push(actions[3].path as any)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
                >
                  <View className="rounded-3xl bg-white p-4" style={shadowStyle}>
                    <View
                      className="h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ backgroundColor: actions[3].bg }}
                    >
                      <Feather
                        name={actions[3].icon as any}
                        size={22}
                        color={actions[3].color}
                      />
                    </View>

                    <Text className="mt-4 text-base font-extrabold text-slate-900">
                      {actions[3].title}
                    </Text>
                    <Text className="mt-1 text-[13px] leading-5 text-slate-500">
                      {actions[3].sub}
                    </Text>

                    <View className="mt-4 flex-row items-center justify-between">
                      <Text
                        className="text-[13px] font-bold"
                        style={{ color: actions[3].color }}
                      >
                        Open
                      </Text>
                      <Feather
                        name="arrow-up-right"
                        size={16}
                        color={actions[3].color}
                      />
                    </View>
                  </View>
                </Pressable>
              </View>
            </View>
          </View>


          <View className="mt-6">
            <Text className="mb-4 text-[12px] font-extrabold uppercase tracking-wider text-slate-400">
              Latest Event
            </Text>

            <View className="rounded-3xl bg-white p-5" style={shadowStyle}>
              <Text className="text-[15px] font-semibold leading-6 text-slate-800">
                {lastEvent}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setHelpVisible(true)}
            className="mt-6 flex-row items-center justify-between rounded-3xl bg-white p-5"
            style={shadowStyle}
          >
            <View className="flex-row items-center">
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
                <Ionicons name="help-circle-outline" size={22} color="#475569" />
              </View>

              <View className="ml-3">
                <Text className="text-[15px] font-bold text-slate-900">
                  How to use this app
                </Text>
                <Text className="mt-0.5 text-[12.5px] text-slate-500">
                  View connection, monitoring, and scheduling help
                </Text>
              </View>
            </View>

            <Feather name="arrow-right" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal animationType="slide" visible={helpVisible}>
        <SafeAreaProvider>
          <SafeAreaView className="flex-1 bg-white">
            <View className="flex-row items-center justify-between border-b border-slate-100 p-5">
              <Text className="text-2xl font-extrabold text-slate-900">
                Help Center
              </Text>
              <TouchableOpacity onPress={() => setHelpVisible(false)}>
                <Ionicons name="close-circle" size={32} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
              <MyAccordion />
            </ScrollView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <Modal transparent visible={deviceDetailsVisible} animationType="fade">
        <View className="flex-1 items-center justify-center bg-slate-950/60 px-5">
          <View className="w-full max-w-[380px] rounded-[30px] bg-white p-6">
            <Text className="mb-5 text-xl font-extrabold text-slate-900">
              Device Details
            </Text>

            {[
              { label: "Connection", value: connectionLabel, color: connectionColor },
              { label: "Device", value: deviceName },
              { label: "Status", value: status },
              { label: "Mode", value: mode },
              { label: "Weight", value: `${weight.toFixed(1)} kg` },
              { label: "Bin Level", value: `${weightPct}%` },
              { label: "Direction", value: motorDir },
              { label: "Speed", value: `${motorSpeed}` },
              { label: "Device Clock", value: rtcTime },
            ].map(({ label, value, color }) => (
              <View
                key={label}
                className="mb-3 flex-row items-start justify-between gap-3"
              >
                <Text className="font-semibold text-slate-500">{label}</Text>
                <Text
                  numberOfLines={1}
                  className="max-w-[58%] text-right font-bold text-slate-900"
                  style={color ? { color } : undefined}
                >
                  {value}
                </Text>
              </View>
            ))}

            <TouchableOpacity
              onPress={() => setDeviceDetailsVisible(false)}
              className="mt-3 items-center rounded-[20px] bg-slate-800 py-4"
            >
              <Text className="font-bold text-white">Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}