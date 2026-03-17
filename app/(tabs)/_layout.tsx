import { Tabs } from "expo-router";
import React from "react";
import { Platform, View } from "react-native";
import Foundation from "@expo/vector-icons/Foundation";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";

import { useColorScheme } from "@/hooks/useColorScheme";
import Header from "@/components/Header";
import FontAwesome from "@expo/vector-icons/FontAwesome";

export default function TabLayout() {
  return (
    <>
      <Header />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: "#6CD058",
          headerShown: false,
          tabBarInactiveTintColor: "gray",
          tabBarStyle: Platform.select({
            ios: {
              position: "absolute",
            },
            default: {
              marginTop: 0,
            },
          }),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => (
              <Foundation size={25} color={color} name="home" />
            ),
          }}
        />
        <Tabs.Screen
          name="dashboard"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons
                size={25}
                color={color}
                name="view-grid"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: "Schedule",
            tabBarIcon: ({ color }) => (
              <FontAwesome5 size={25} color={color} name="calendar-day" />
            ),
          }}
        />
        <Tabs.Screen
          name="monitoring"
          options={{
            title: "Monitoring",
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons
                size={25}
                color={color}
                name="monitor-dashboard"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="notification"
          options={{
            title: "Notication",
            href: null,
            tabBarIcon: ({ color }) => (
              <FontAwesome size={25} color={color} name="user-circle" />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
