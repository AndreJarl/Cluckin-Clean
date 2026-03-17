import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";

type Props = {
  value: Date;
  onChange: (date: Date) => void;
};

export default function CustomCalendar({ value, onChange }: Props) {
  const { width } = useWindowDimensions();

  const [currentMonth, setCurrentMonth] = React.useState(() => {
    return new Date(value.getFullYear(), value.getMonth(), 1);
  });

  const today = new Date();

  const daysInMonth = (year: number, month: number) =>
    new Date(year, month + 1, 0).getDate();

  const firstDayWeekday = (year: number, month: number) =>
    new Date(year, month, 1).getDay(); // 0 = Sun

  const prevMonth = () =>
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
    );

  const nextMonth = () =>
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
    );

  const buildGrid = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const daysPrevMonth = daysInMonth(year, month - 1);
    const daysThisMonth = daysInMonth(year, month);
    const startOffset = firstDayWeekday(year, month);

    const grid: { date: Date; inMonth: boolean }[] = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      grid.push({
        date: new Date(year, month - 1, daysPrevMonth - i),
        inMonth: false,
      });
    }

    for (let d = 1; d <= daysThisMonth; d++) {
      grid.push({
        date: new Date(year, month, d),
        inMonth: true,
      });
    }

    while (grid.length < 42) {
      const d = grid.length - (startOffset + daysThisMonth) + 1;
      grid.push({
        date: new Date(year, month + 1, d),
        inMonth: false,
      });
    }

    return grid;
  };

  const grid = buildGrid();

  const cellSize = Math.floor((width - 32) / 7);
  const monthLabel = currentMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={prevMonth}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.monthLabel}>{monthLabel}</Text>

        <TouchableOpacity onPress={nextMonth}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekdays */}
      <View style={styles.weekRow}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <View key={d} style={{ width: cellSize, alignItems: "center" }}>
            <Text style={styles.weekDayText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Dates */}
      <View style={styles.grid}>
        {grid.map(({ date, inMonth }, idx) => {
          const selected = isSameDay(date, value);
          const todayMatch = isSameDay(date, today);

          return (
            <TouchableOpacity
              key={idx}
              onPress={() => onChange(date)}
              style={[
                styles.dateCell,
                { width: cellSize, height: cellSize },
                !inMonth && styles.outsideMonth,
                selected && styles.selectedCell,
              ]}
            >
              <Text
                style={[
                  styles.dateText,
                  todayMatch && styles.todayText,
                  selected && styles.selectedText,
                ]}
              >
                {date.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "white",
    borderRadius: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  navText: {
    fontSize: 22,
    color: "#111827",
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: "700",
  },
  weekRow: {
    flexDirection: "row",
    marginTop: 10,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dateCell: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
    borderRadius: 6,
  },
  outsideMonth: {
    opacity: 0.4,
  },
  dateText: {
    fontSize: 14,
  },
  todayText: {
    color: "#0b74ff",
    fontWeight: "700",
  },
  selectedCell: {
    backgroundColor: "#0b74ff",
  },
  selectedText: {
    color: "white",
    fontWeight: "700",
  },
});
