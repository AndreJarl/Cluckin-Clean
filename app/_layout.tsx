import "@/global.css";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import "dayjs/locale/fr";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { en, registerTranslation } from "react-native-paper-dates";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";
import { useEffect } from "react";
import { MD3LightTheme, PaperProvider } from "react-native-paper";

registerTranslation("en", en);

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#6200ee",
    onSurface: "#000000",
    onSurfaceVariant: "#444",
    surface: "#ffffff",
    outline: "#ccc",
  },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    MaterialCommunityIcons: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      // SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <PaperProvider theme={theme}>
     
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="+not-found" />
            </Stack>
        
          <StatusBar style="dark" />
      </PaperProvider>
    </ThemeProvider>
  );
}
