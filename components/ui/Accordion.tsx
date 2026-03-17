import * as React from "react";
import { StyleSheet, Image } from "react-native";
import { List, Text } from "react-native-paper";

const SECTIONS = [
  {
    title: "📊 Dashboard",
    content:
      "The dashboard shows the machine status with controls to Start, Pause, or Reset. You can also track progress in real-time through a progress bar.",
    image: require("@/assets/images/phonePic.jpg"),
  },
  {
    title: "🗓️ Schedule",
    content:
      "In the schedule section, you can set cleaning and maintenance times. It also displays 'Today's Schedule' for quick tracking.",
    image: require("@/assets/images/phonePic.jpg"),
  },
  {
    title: "📡 Monitoring",
    content:
      "The monitoring section provides detailed data about machine performance, cleaning statistics, and history logs.",
    image: require("@/assets/images/phonePic.jpg"),
  },
];

export default function MyAccordion() {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const handlePress = (title: string) => {
    setExpanded(expanded === title ? null : title);
  };

  return (
    <List.Section>
      {SECTIONS.map((section) => (
        <List.Accordion
          key={section.title}
          title={section.title}
          expanded={expanded === section.title}
          onPress={() => handlePress(section.title)}
        >
          <Text style={styles.contentText}>{section.content}</Text>
          <Image
            source={section.image}
            style={styles.image}
            resizeMode="contain"
          />
        </List.Accordion>
      ))}
    </List.Section>
  );
}

const styles = StyleSheet.create({
  contentText: {
    fontSize: 16,
    color: "#333",
    lineHeight: 22,
    marginBottom: 12,
    paddingHorizontal: 15,
  },
  image: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 15,
  },
});
