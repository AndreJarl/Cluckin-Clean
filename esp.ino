#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <HX711.h>
#include <ESP32Servo.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include <ThreeWire.h>
#include <RtcDS1302.h>

// =========================
// PIN MAP
// =========================
static const int PIN_SERVO      = 13;
static const int PIN_TRIG       = 18;
static const int PIN_ECHO       = 19;

static const int PIN_RTC_CLK    = 27;
static const int PIN_RTC_DAT    = 26;
static const int PIN_RTC_RST    = 25;

static const int PIN_MOTOR_ENA  = 14;
static const int PIN_MOTOR_IN1  = 16;
static const int PIN_MOTOR_IN2  = 17;

static const int PIN_HX_DOUT    = 4;
static const int PIN_HX_SCK     = 5;

// =========================
// MOTOR SETTINGS
// =========================
static const int MOTOR_PWM_FREQ = 1000;
static const int MOTOR_PWM_RES  = 8;
static const int DEFAULT_MOTOR_SPEED = 120;

// =========================
// SERVO SETTINGS
// =========================
static const int SERVO_CLOSED_ANGLE = 0;
static const int SERVO_OPEN_ANGLE   = 90;

// =========================
// ULTRASONIC SETTINGS
// =========================
static const float LID_OPEN_DISTANCE_CM = 15.0f;
static const unsigned long LID_HOLD_MS = 3000;

// =========================
// LOAD CELL SETTINGS
// =========================
static const float DEFAULT_BIN_FULL_G = 20.0f;
static const float DEFAULT_BIN_CLEAR_G = 18.0f;
static const float DEFAULT_CAL_FACTOR = 100.0f;

// =========================
// STORAGE LIMITS
// =========================
static const int MAX_SCHEDULES = 8;
static const int MAX_HISTORY   = 30;

// =========================
// BLE UUIDs
// =========================
#define SERVICE_UUID        "5c14a7e0-5344-4c7c-b11a-b7c9a4d00001"
#define RX_CHAR_UUID        "5c14a7e0-5344-4c7c-b11a-b7c9a4d00002"
#define TX_CHAR_UUID        "5c14a7e0-5344-4c7c-b11a-b7c9a4d00003"

// =========================
// RTC
// =========================
ThreeWire myWire(PIN_RTC_DAT, PIN_RTC_CLK, PIN_RTC_RST);
RtcDS1302<ThreeWire> rtc(myWire);

// =========================
// GLOBAL OBJECTS
// =========================
Preferences prefs;
HX711 scale;
Servo lidServo;

BLEServer* bleServer = nullptr;
BLECharacteristic* txChar = nullptr;
BLECharacteristic* rxChar = nullptr;
bool bleClientConnected = false;

// =========================
// DATA STRUCTURES
// =========================
struct AppConfig {
  bool autoMode;
  bool conveyorEnabled;
  int motorSpeed;
  float binFullThresholdG;
  float binClearThresholdG;
  float calibrationFactor;
  long tareOffset;
  bool lidEnabled;
};

struct ScheduleItem {
  bool enabled;
  uint8_t hour;
  uint8_t minute;
  uint16_t durationSec;
  uint8_t weekdaysMask;
  uint32_t lastTriggerDateKey;
  uint16_t lastTriggerMinute;
};

struct HistoryItem {
  uint32_t epochLike;
  char type[20];
  char message[80];
  float value1;
  float value2;
};

AppConfig config;
ScheduleItem schedules[MAX_SCHEDULES];
HistoryItem historyLog[MAX_HISTORY];
int historyCount = 0;

// =========================
// RUNTIME STATE
// =========================
bool motorRunning = false;
bool motorManualMode = false;
unsigned long motorRunUntilMs = 0;

bool lidOpen = false;
unsigned long lidCloseAtMs = 0;

float lastDistanceCm = -1.0f;
long lastRawWeight = 0;
float lastWeightG = 0.0f;

bool binFullState = false;

unsigned long lastSensorReadMs = 0;
unsigned long lastStatusNotifyMs = 0;
unsigned long lastScheduleCheckMs = 0;
unsigned long lastLoadDebugMs = 0;

// =========================
// HELPERS
// =========================
uint32_t makeDateKey(int year, int month, int day) {
  return (uint32_t)year * 10000UL + (uint32_t)month * 100UL + (uint32_t)day;
}

uint32_t packTimestamp(const RtcDateTime& now) {
  return (uint32_t)(now.Year() % 100) * 100000000UL +
         (uint32_t)now.Month() * 1000000UL +
         (uint32_t)now.Day() * 10000UL +
         (uint32_t)now.Hour() * 100UL +
         (uint32_t)now.Minute();
}

String rtcToIsoString(const RtcDateTime& now) {
  char buf[25];
  snprintf(buf, sizeof(buf), "%04u-%02u-%02u %02u:%02u:%02u",
           now.Year(), now.Month(), now.Day(),
           now.Hour(), now.Minute(), now.Second());
  return String(buf);
}

uint8_t getWeekdayIndex(const RtcDateTime& dt) {
  return dt.DayOfWeek();
}

// =========================
// STORAGE
// =========================
void saveConfig() {
  prefs.putBytes("config", &config, sizeof(config));
}

void loadConfig() {
  if (prefs.isKey("config")) {
    prefs.getBytes("config", &config, sizeof(config));
  } else {
    config.autoMode = true;
    config.conveyorEnabled = true;
    config.motorSpeed = DEFAULT_MOTOR_SPEED;
    config.binFullThresholdG = DEFAULT_BIN_FULL_G;
    config.binClearThresholdG = DEFAULT_BIN_CLEAR_G;
    config.calibrationFactor = DEFAULT_CAL_FACTOR;
    config.tareOffset = 0;
    config.lidEnabled = true;
    saveConfig();
  }
}

void saveSchedules() {
  prefs.putBytes("schedules", schedules, sizeof(schedules));
}

void loadSchedules() {
  if (prefs.isKey("schedules")) {
    prefs.getBytes("schedules", schedules, sizeof(schedules));
  } else {
    memset(schedules, 0, sizeof(schedules));
    saveSchedules();
  }
}

void saveHistory() {
  prefs.putBytes("history", historyLog, sizeof(historyLog));
  prefs.putInt("historyCount", historyCount);
}

void loadHistory() {
  if (prefs.isKey("history")) {
    prefs.getBytes("history", historyLog, sizeof(historyLog));
    historyCount = prefs.getInt("historyCount", 0);
    if (historyCount < 0) historyCount = 0;
    if (historyCount > MAX_HISTORY) historyCount = MAX_HISTORY;
  } else {
    memset(historyLog, 0, sizeof(historyLog));
    historyCount = 0;
    saveHistory();
  }
}

// =========================
// HISTORY
// =========================
void addHistory(const char* type, const char* message, float value1 = 0, float value2 = 0) {
  RtcDateTime now = rtc.GetDateTime();

  HistoryItem item;
  item.epochLike = packTimestamp(now);
  strncpy(item.type, type, sizeof(item.type) - 1);
  item.type[sizeof(item.type) - 1] = '\0';
  strncpy(item.message, message, sizeof(item.message) - 1);
  item.message[sizeof(item.message) - 1] = '\0';
  item.value1 = value1;
  item.value2 = value2;

  if (historyCount < MAX_HISTORY) {
    historyLog[historyCount++] = item;
  } else {
    for (int i = 1; i < MAX_HISTORY; i++) {
      historyLog[i - 1] = historyLog[i];
    }
    historyLog[MAX_HISTORY - 1] = item;
  }

  saveHistory();
}

// =========================
// BLE SEND
// =========================
void bleNotifyJson(const JsonDocument& doc) {
  if (!bleClientConnected || txChar == nullptr) return;

  String out;
  serializeJson(doc, out);
  txChar->setValue(out.c_str());
  txChar->notify();

  Serial.print("BLE TX: ");
  Serial.println(out);
}

void sendAck(const char* cmd, bool ok, const char* message) {
  StaticJsonDocument<256> doc;
  doc["type"] = "ack";
  doc["cmd"] = cmd;
  doc["ok"] = ok;
  doc["message"] = message;
  bleNotifyJson(doc);
}

void sendEvent(const char* eventName, const char* message, float value1 = 0, float value2 = 0) {
  StaticJsonDocument<256> doc;
  doc["type"] = "event";
  doc["event"] = eventName;
  doc["message"] = message;
  doc["value1"] = value1;
  doc["value2"] = value2;
  bleNotifyJson(doc);
}

void sendStatus() {
  StaticJsonDocument<256> doc;

  doc["type"] = "status";
  doc["motorRunning"] = motorRunning;
  doc["motorManualMode"] = motorManualMode;
  doc["motorSpeed"] = config.motorSpeed;
  doc["distanceCm"] = lastDistanceCm;
  doc["weight_g"] = lastWeightG;
  doc["binFull"] = binFullState;
  doc["lidOpen"] = lidOpen;
  doc["lidEnabled"] = config.lidEnabled;
  doc["autoMode"] = config.autoMode;
  doc["conveyorEnabled"] = config.conveyorEnabled;

  bleNotifyJson(doc);
}

void sendSchedules() {
  StaticJsonDocument<1024> doc;
  doc["type"] = "schedules";

  JsonArray arr = doc.createNestedArray("items");
  for (int i = 0; i < MAX_SCHEDULES; i++) {
    JsonObject o = arr.createNestedObject();
    o["index"] = i;
    o["enabled"] = schedules[i].enabled;
    o["hour"] = schedules[i].hour;
    o["minute"] = schedules[i].minute;
    o["durationSec"] = schedules[i].durationSec;
    o["weekdaysMask"] = schedules[i].weekdaysMask;
  }

  bleNotifyJson(doc);
}

void sendHistory() {
  StaticJsonDocument<4096> doc;
  doc["type"] = "history";

  JsonArray arr = doc.createNestedArray("items");
  for (int i = 0; i < historyCount; i++) {
    JsonObject o = arr.createNestedObject();
    o["index"] = i;
    o["ts"] = historyLog[i].epochLike;
    o["type"] = historyLog[i].type;
    o["message"] = historyLog[i].message;
    o["value1"] = historyLog[i].value1;
    o["value2"] = historyLog[i].value2;
  }

  bleNotifyJson(doc);
}

// =========================
// MOTOR CONTROL
// =========================
void motorForward(int speedValue) {
  if (!config.conveyorEnabled) return;

  speedValue = constrain(speedValue, 0, 255);
  digitalWrite(PIN_MOTOR_IN1, HIGH);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  ledcWrite(PIN_MOTOR_ENA, speedValue);
  motorRunning = true;
}

void motorStop() {
  ledcWrite(PIN_MOTOR_ENA, 0);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  motorRunning = false;
  motorManualMode = false;
  motorRunUntilMs = 0;
}

void startManualMotor() {
  motorManualMode = true;
  motorRunUntilMs = 0;
  motorForward(config.motorSpeed);
  addHistory("motor", "Manual motor ON", config.motorSpeed, 0);
  sendEvent("motor_on", "Manual conveyor ON", config.motorSpeed, 0);
}

void stopManualMotor() {
  motorStop();
  addHistory("motor", "Manual motor OFF", 0, 0);
  sendEvent("motor_off", "Manual conveyor OFF", 0, 0);
}

void runScheduledMotor(uint16_t durationSec) {
  if (!config.conveyorEnabled) return;

  motorManualMode = false;
  motorForward(config.motorSpeed);
  motorRunUntilMs = millis() + (unsigned long)durationSec * 1000UL;

  addHistory("schedule", "Scheduled conveyor run started", durationSec, config.motorSpeed);
  sendEvent("schedule_run", "Scheduled conveyor run started", durationSec, config.motorSpeed);
}

// =========================
// SERVO / LID
// =========================
void openLid() {
  if (!config.lidEnabled) return;

  lidServo.write(SERVO_OPEN_ANGLE);
  lidOpen = true;
  lidCloseAtMs = millis() + LID_HOLD_MS;
}

void closeLid() {
  lidServo.write(SERVO_CLOSED_ANGLE);
  lidOpen = false;
}

// =========================
// SENSORS
// =========================
float readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long duration = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duration == 0) return -1.0f;

  float distance = duration * 0.0343f / 2.0f;
  return distance;
}

long readAverageRaw(int samples = 10) {
  long sum = 0;
  int valid = 0;

  for (int i = 0; i < samples; i++) {
    if (scale.is_ready()) {
      sum += scale.read();
      valid++;
    }
    delay(5);
  }

  if (valid == 0) return lastRawWeight;
  return sum / valid;
}

float rawToGrams(long raw) {
  return ((float)(raw - config.tareOffset)) / config.calibrationFactor;
}

void printLoadCellDebug() {
  Serial.print("Raw: ");
  Serial.print(lastRawWeight);
  Serial.print("  Tare: ");
  Serial.print(config.tareOffset);
  Serial.print("  CalFactor: ");
  Serial.print(config.calibrationFactor);
  Serial.print("  Weight_g: ");
  Serial.println(lastWeightG);
}

void performTare() {
  long avg = readAverageRaw(20);
  config.tareOffset = avg;
  saveConfig();

  Serial.print("Tare offset set to: ");
  Serial.println(config.tareOffset);

  addHistory("loadcell", "Tare completed", avg, 0);
  sendEvent("tare_done", "Load cell tare complete", avg, 0);
}

// =========================
// AUTONOMOUS CHECKS
// =========================
void checkLidLogic() {
  lastDistanceCm = readDistanceCm();

  if (config.lidEnabled && lastDistanceCm > 0 && lastDistanceCm <= LID_OPEN_DISTANCE_CM) {
    if (!lidOpen) {
      openLid();
      addHistory("lid", "Lid opened by ultrasonic", lastDistanceCm, 0);
      sendEvent("lid_open", "Ultrasonic detected object, lid opened", lastDistanceCm, 0);
    } else {
      lidCloseAtMs = millis() + LID_HOLD_MS;
    }
  }

  if (lidOpen && millis() > lidCloseAtMs) {
    closeLid();
    addHistory("lid", "Lid closed", 0, 0);
    sendEvent("lid_close", "Lid closed", 0, 0);
  }
}

void checkLoadCellLogic() {
  lastRawWeight = readAverageRaw(10);
  lastWeightG = rawToGrams(lastRawWeight);

  if (!binFullState && lastWeightG >= config.binFullThresholdG) {
    binFullState = true;
    addHistory("bin", "The waste bin is full please change", lastWeightG, 0);
    sendEvent("bin_full", "The waste bin is full please change", lastWeightG, 0);
  } else if (binFullState && lastWeightG <= config.binClearThresholdG) {
    binFullState = false;
    addHistory("bin", "Waste bin returned below full threshold", lastWeightG, 0);
    sendEvent("bin_clear", "Waste bin is no longer full", lastWeightG, 0);
  }

  if (millis() - lastLoadDebugMs >= 1000) {
    lastLoadDebugMs = millis();
    printLoadCellDebug();
  }
}

void checkScheduleLogic() {
  if (!config.autoMode) return;
  if (!config.conveyorEnabled) return;

  RtcDateTime now = rtc.GetDateTime();
  uint8_t weekday = getWeekdayIndex(now);
  uint16_t minuteOfDay = now.Hour() * 60 + now.Minute();
  uint32_t dateKey = makeDateKey(now.Year(), now.Month(), now.Day());

  for (int i = 0; i < MAX_SCHEDULES; i++) {
    if (!schedules[i].enabled) continue;

    bool dayMatch = (schedules[i].weekdaysMask & (1 << weekday)) != 0;
    if (!dayMatch) continue;

    uint16_t schedMinute = schedules[i].hour * 60 + schedules[i].minute;

    if (minuteOfDay == schedMinute) {
      bool alreadyTriggeredTodayThisMinute =
        (schedules[i].lastTriggerDateKey == dateKey) &&
        (schedules[i].lastTriggerMinute == minuteOfDay);

      if (!alreadyTriggeredTodayThisMinute) {
        runScheduledMotor(schedules[i].durationSec);
        schedules[i].lastTriggerDateKey = dateKey;
        schedules[i].lastTriggerMinute = minuteOfDay;
        saveSchedules();

        addHistory("schedule", "Schedule matched and triggered", i, schedules[i].durationSec);
      }
    }
  }
}

void updateMotorRuntime() {
  if (motorRunning && !motorManualMode && motorRunUntilMs > 0 && millis() >= motorRunUntilMs) {
    motorStop();
    addHistory("motor", "Scheduled motor run finished", 0, 0);
    sendEvent("motor_stop", "Scheduled conveyor run finished", 0, 0);
  }
}

// =========================
// BLE CALLBACKS
// =========================
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    bleClientConnected = true;
    addHistory("ble", "BLE client connected", 0, 0);
  }

  void onDisconnect(BLEServer* pServer) override {
    bleClientConnected = false;
    addHistory("ble", "BLE client disconnected", 0, 0);
    BLEDevice::startAdvertising();
  }
};

void handleSetSchedule(JsonDocument& doc) {
  if (!doc.containsKey("index")) {
    sendAck("setSchedule", false, "Missing index");
    return;
  }

  int idx = doc["index"];
  if (idx < 0 || idx >= MAX_SCHEDULES) {
    sendAck("setSchedule", false, "Invalid index");
    return;
  }

  schedules[idx].enabled = doc["enabled"] | true;
  schedules[idx].hour = doc["hour"] | 0;
  schedules[idx].minute = doc["minute"] | 0;
  schedules[idx].durationSec = doc["durationSec"] | 2;
  schedules[idx].weekdaysMask = doc["weekdaysMask"] | 127;

  saveSchedules();
  addHistory("schedule", "Schedule updated", idx, schedules[idx].durationSec);
  sendAck("setSchedule", true, "Schedule updated");
  sendSchedules();
}

void handleRemoveSchedule(JsonDocument& doc) {
  if (!doc.containsKey("index")) {
    sendAck("removeSchedule", false, "Missing index");
    return;
  }

  int idx = doc["index"];
  if (idx < 0 || idx >= MAX_SCHEDULES) {
    sendAck("removeSchedule", false, "Invalid index");
    return;
  }

  memset(&schedules[idx], 0, sizeof(ScheduleItem));
  saveSchedules();

  addHistory("schedule", "Schedule removed", idx, 0);
  sendAck("removeSchedule", true, "Schedule removed");
  sendSchedules();
}

void handleBleCommand(const String& json) {
  Serial.print("BLE RX: ");
  Serial.println(json);

  StaticJsonDocument<1024> doc;
  DeserializationError err = deserializeJson(doc, json);

  if (err) {
    sendAck("parse", false, "Invalid JSON");
    return;
  }

  const char* cmd = doc["cmd"] | "";
  if (strlen(cmd) == 0) {
    sendAck("unknown", false, "Missing cmd");
    return;
  }

  if (strcmp(cmd, "getStatus") == 0) {
    sendStatus();
    return;
  }

  if (strcmp(cmd, "getSchedules") == 0) {
    sendSchedules();
    return;
  }

  if (strcmp(cmd, "getHistory") == 0) {
    sendHistory();
    return;
  }

  if (strcmp(cmd, "motorOn") == 0) {
    startManualMotor();
    sendAck(cmd, true, "Motor turned ON");
    return;
  }

  if (strcmp(cmd, "motorOff") == 0) {
    stopManualMotor();
    sendAck(cmd, true, "Motor turned OFF");
    return;
  }

  if (strcmp(cmd, "runMotorFor") == 0) {
    int sec = doc["durationSec"] | 2;
    sec = constrain(sec, 1, 60);
    motorManualMode = false;
    motorForward(config.motorSpeed);
    motorRunUntilMs = millis() + (unsigned long)sec * 1000UL;
    addHistory("motor", "Motor run for duration", sec, config.motorSpeed);
    sendAck(cmd, true, "Motor started for duration");
    return;
  }

  if (strcmp(cmd, "setMotorSpeed") == 0) {
    int speed = doc["speed"] | DEFAULT_MOTOR_SPEED;
    config.motorSpeed = constrain(speed, 0, 255);
    saveConfig();

    if (motorRunning) {
      motorForward(config.motorSpeed);
    }

    addHistory("config", "Motor speed updated", config.motorSpeed, 0);
    sendAck(cmd, true, "Motor speed updated");
    return;
  }

  if (strcmp(cmd, "setAutoMode") == 0) {
    config.autoMode = doc["enabled"] | true;
    saveConfig();
    addHistory("config", "Auto mode changed", config.autoMode, 0);
    sendAck(cmd, true, "Auto mode updated");
    return;
  }

  if (strcmp(cmd, "setConveyorEnabled") == 0) {
    config.conveyorEnabled = doc["enabled"] | true;
    saveConfig();

    if (!config.conveyorEnabled && motorRunning) {
      motorStop();
    }

    addHistory("config", "Conveyor enabled changed", config.conveyorEnabled, 0);
    sendAck(cmd, true, "Conveyor enabled updated");
    return;
  }

  if (strcmp(cmd, "setLidEnabled") == 0) {
    config.lidEnabled = doc["enabled"] | true;
    saveConfig();
    addHistory("config", "Lid enabled changed", config.lidEnabled, 0);
    sendAck(cmd, true, "Lid enabled updated");
    return;
  }

  if (strcmp(cmd, "setSchedule") == 0) {
    handleSetSchedule(doc);
    return;
  }

  if (strcmp(cmd, "removeSchedule") == 0) {
    handleRemoveSchedule(doc);
    return;
  }

  if (strcmp(cmd, "tareLoadCell") == 0) {
    performTare();
    sendAck(cmd, true, "Tare complete");
    return;
  }

  if (strcmp(cmd, "setCalibrationFactor") == 0) {
    float factor = doc["factor"] | DEFAULT_CAL_FACTOR;
    if (factor == 0.0f) {
      sendAck(cmd, false, "Factor cannot be zero");
      return;
    }
    config.calibrationFactor = factor;
    saveConfig();

    Serial.print("Calibration factor updated to: ");
    Serial.println(config.calibrationFactor);

    addHistory("config", "Calibration factor updated", factor, 0);
    sendAck(cmd, true, "Calibration factor updated");
    return;
  }

  if (strcmp(cmd, "setBinThreshold") == 0) {
    config.binFullThresholdG = doc["full_g"] | DEFAULT_BIN_FULL_G;
    config.binClearThresholdG = doc["clear_g"] | DEFAULT_BIN_CLEAR_G;
    saveConfig();

    addHistory("config", "Bin thresholds updated", config.binFullThresholdG, config.binClearThresholdG);
    sendAck(cmd, true, "Bin thresholds updated");
    return;
  }

  if (strcmp(cmd, "setRtc") == 0) {
    int year   = doc["year"]   | 2026;
    int month  = doc["month"]  | 1;
    int day    = doc["day"]    | 1;
    int hour   = doc["hour"]   | 0;
    int minute = doc["minute"] | 0;
    int second = doc["second"] | 0;

    RtcDateTime dt(year, month, day, hour, minute, second);
    rtc.SetDateTime(dt);

    Serial.print("RTC updated to: ");
    Serial.println(rtcToIsoString(dt));

    addHistory("rtc", "RTC updated from app", year, month);
    sendAck(cmd, true, "RTC updated");
    return;
  }

  if (strcmp(cmd, "clearHistory") == 0) {
    memset(historyLog, 0, sizeof(historyLog));
    historyCount = 0;
    saveHistory();
    sendAck(cmd, true, "History cleared");
    return;
  }

  sendAck(cmd, false, "Unknown command");
}

class RxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    String incoming = characteristic->getValue();
    if (incoming.length() > 0) {
      handleBleCommand(incoming);
    }
  }
};

// =========================
// BLE SETUP
// =========================
// =========================
// BLE SETUP
// =========================
void setupBle() {
  BLEDevice::init("ESP32_ConveyorCleaner");
  
  // CRITICAL: This allows the ESP32 to receive large JSON strings.
  // Without this, writing long commands will fail.
  BLEDevice::setMTU(512); 

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new MyServerCallbacks());

  BLEService* service = bleServer->createService(SERVICE_UUID);

  txChar = service->createCharacteristic(
    TX_CHAR_UUID,
    BLECharacteristic::PROPERTY_NOTIFY |
    BLECharacteristic::PROPERTY_READ
  );
  txChar->addDescriptor(new BLE2902());

  rxChar = service->createCharacteristic(
    RX_CHAR_UUID,
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  
  // Attach the RX callbacks to handle incoming commands
  rxChar->setCallbacks(new RxCallbacks());

  service->start();

  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->start();

  Serial.println("BLE advertising started");
  Serial.println("BLE service and characteristics created");
  Serial.print("SERVICE_UUID: ");
  Serial.println(SERVICE_UUID);
  Serial.print("RX_CHAR_UUID: ");
  Serial.println(RX_CHAR_UUID);
  Serial.print("TX_CHAR_UUID: ");
  Serial.println(TX_CHAR_UUID);
}

// =========================
// SETUP
// =========================
void setup() {
  Serial.begin(115200);
  delay(500);

  prefs.begin("cleaner", false);
  loadConfig();
  loadSchedules();
  loadHistory();

  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  ledcAttach(PIN_MOTOR_ENA, MOTOR_PWM_FREQ, MOTOR_PWM_RES);
  motorStop();

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);

  lidServo.attach(PIN_SERVO);
  closeLid();

  rtc.Begin();
  if (!rtc.IsDateTimeValid()) {
    Serial.println("RTC time invalid. Please set RTC from app.");
  } else {
    RtcDateTime now = rtc.GetDateTime();
    Serial.print("RTC time: ");
    Serial.println(rtcToIsoString(now));
  }

  scale.begin(PIN_HX_DOUT, PIN_HX_SCK);
  delay(500);

  setupBle();

  addHistory("system", "System boot", 0, 0);
  Serial.println("System ready");
}

// =========================
// LOOP
// =========================
void loop() {
  unsigned long nowMs = millis();

  if (nowMs - lastSensorReadMs >= 300) {
    lastSensorReadMs = nowMs;
    checkLidLogic();
    checkLoadCellLogic();
  }

  if (nowMs - lastScheduleCheckMs >= 1000) {
    lastScheduleCheckMs = nowMs;
    checkScheduleLogic();
  }

  updateMotorRuntime();

  if (bleClientConnected && nowMs - lastStatusNotifyMs >= 1000) {
    lastStatusNotifyMs = nowMs;
    sendStatus();
  }
}