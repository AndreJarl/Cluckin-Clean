#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <NewPing.h>
#include <Ds1302.h>
#include <ESP32Servo.h>
#include "HX711.h"

// ================= WIFI =================
const char* WIFI_SSID = "404 Network Unavailable";
const char* WIFI_PASS = "dikouy2004!";

// ================= FIREBASE =================
const char* FIREBASE_HOST = "https://loctrack-552df-default-rtdb.asia-southeast1.firebasedatabase.app";
const char* FIREBASE_AUTH = "";

// ================= DEVICE =================
const char* DEVICE_ID = "conveyorCleaner01";

// ================= PINS =================
const int SERVO_PIN = 13;

const int RPWM = 14;
const int LPWM = 16;
const int REN  = 17;
const int LEN  = 22;

const int TRIG_PIN = 18;
const int ECHO_PIN = 19;
const int MAX_DISTANCE = 400;

const int RTC_RST = 25;
const int RTC_DAT = 26;
const int RTC_CLK = 27;

const int HX_DOUT = 4;
const int HX_SCK  = 5;

// ================= OBJECTS =================
NewPing sonar(TRIG_PIN, ECHO_PIN, MAX_DISTANCE);
Ds1302 rtc(RTC_RST, RTC_CLK, RTC_DAT);
HX711 scale;
Servo binServo;

// ================= CALIBRATION =================
float calibrationFactor = 150.23;

// ================= LOAD THRESHOLDS =================
// raw-based presence detection
const long LOAD_ON_THRESHOLD  = 10000;
const long LOAD_OFF_THRESHOLD = 5000;

// ================= BIN FULL THRESHOLD =================
// user-adjustable, grams
const float DEFAULT_BIN_FULL_THRESHOLD_G = 500.0;
const float MIN_BIN_FULL_THRESHOLD_G = 500.0;
const float MAX_BIN_FULL_THRESHOLD_G = 10000.0;
const float BIN_FULL_HYSTERESIS_G = 50.0;

float binFullThresholdGrams = DEFAULT_BIN_FULL_THRESHOLD_G;

// ================= WEIGHT DISPLAY STABILITY =================
const float ZERO_DEADBAND_G = 10.0;

// ================= SERVO ANGLES =================
const int SERVO_CLOSED_ANGLE = 90;
const int SERVO_OPEN_ANGLE   = 180;

// ================= DEFAULTS =================
const int DEFAULT_MANUAL_PWM = 180;
const int DEFAULT_RUN_MS     = 10000;

// ================= STATE =================
bool conveyorIsOn = false;
bool loadPresent = false;
bool binFull = false;
bool servoOpened = false;

bool manualRun = false;
int manualPwm = DEFAULT_MANUAL_PWM;

unsigned long lastFirebaseSend = 0;
unsigned long lastWifiCheck = 0;
unsigned long lastControlPoll = 0;
unsigned long lastSchedulePoll = 0;
unsigned long conveyorLastChanged = 0;

// ================= AUTO RUN STATE =================
bool autoRunActive = false;
unsigned long autoRunStartedAt = 0;
unsigned long autoRunDurationMs = DEFAULT_RUN_MS;
int autoRunPwm = DEFAULT_MANUAL_PWM;
String activeScheduleId = "";

// ================= SCHEDULE STORAGE =================
const int MAX_SCHEDULES = 20;

struct ScheduleSlot {
  String id;
  String scheduleId;
  String title;
  String date;
  String hour;
  String minute;
  String duration;
  bool enabled;
  String status;
  unsigned long createdAt;
};

ScheduleSlot schedules[MAX_SCHEDULES];
int scheduleCount = 0;

String lastTriggeredScheduleKey = "";

// ---------------- WIFI ----------------
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  Serial.print("Connecting to WiFi");
  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi connected");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection failed");
  }
}

// ---------------- MOTOR ----------------
void motorForward(int pwmValue) {
  pwmValue = constrain(pwmValue, 0, 255);

  digitalWrite(REN, HIGH);
  digitalWrite(LEN, HIGH);

  ledcWrite(LPWM, 0);
  ledcWrite(RPWM, pwmValue);

  if (!conveyorIsOn) {
    conveyorIsOn = true;
    conveyorLastChanged = millis();
  }
}

void motorStop() {
  ledcWrite(RPWM, 0);
  ledcWrite(LPWM, 0);
  digitalWrite(REN, HIGH);
  digitalWrite(LEN, HIGH);

  if (conveyorIsOn) {
    conveyorIsOn = false;
    conveyorLastChanged = millis();
  }
}

// ---------------- SERVO ----------------
void openBinServo() {
  binServo.write(SERVO_OPEN_ANGLE);
  servoOpened = true;
}

void closeBinServo() {
  binServo.write(SERVO_CLOSED_ANGLE);
  servoOpened = false;
}

// ---------------- HELPERS ----------------
String twoDigits(int v) {
  if (v < 10) return "0" + String(v);
  return String(v);
}

float clampBinThreshold(float value) {
  if (value < MIN_BIN_FULL_THRESHOLD_G) return MIN_BIN_FULL_THRESHOLD_G;
  if (value > MAX_BIN_FULL_THRESHOLD_G) return MAX_BIN_FULL_THRESHOLD_G;
  return value;
}

String getRtcString() {
  Ds1302::DateTime now;
  rtc.getDateTime(&now);

  String s = "20" + String(now.year) + "-";
  s += twoDigits(now.month) + "-";
  s += twoDigits(now.day) + " ";
  s += twoDigits(now.hour) + ":";
  s += twoDigits(now.minute) + ":";
  s += twoDigits(now.second);

  return s;
}

String getRtcDate() {
  Ds1302::DateTime now;
  rtc.getDateTime(&now);
  return "20" + String(now.year) + "-" + twoDigits(now.month) + "-" + twoDigits(now.day);
}

String getRtcHour() {
  Ds1302::DateTime now;
  rtc.getDateTime(&now);
  return twoDigits(now.hour);
}

String getRtcMinute() {
  Ds1302::DateTime now;
  rtc.getDateTime(&now);
  return twoDigits(now.minute);
}

void updateLoadHysteresis(long rawValue) {
  long mag = abs(rawValue);

  if (!loadPresent && mag >= LOAD_ON_THRESHOLD) {
    loadPresent = true;
  } else if (loadPresent && mag <= LOAD_OFF_THRESHOLD) {
    loadPresent = false;
  }
}

float rawToGrams(long rawValue) {
  return rawValue / calibrationFactor;
}

float rawToKg(long rawValue) {
  return rawToGrams(rawValue) / 1000.0;
}

void updateBinFullState(float weightGrams) {
  if (!binFull && weightGrams >= binFullThresholdGrams) {
    binFull = true;
  } else if (binFull && weightGrams <= (binFullThresholdGrams - BIN_FULL_HYSTERESIS_G)) {
    binFull = false;
  }
}

// ---------------- JSON PARSERS ----------------
bool parseJsonBool(String json, const char* key, bool fallbackValue) {
  String pattern = String("\"") + key + "\":";
  int start = json.indexOf(pattern);
  if (start < 0) return fallbackValue;

  start += pattern.length();
  while (start < (int)json.length() &&
         (json[start] == ' ' || json[start] == '\n' || json[start] == '\r')) {
    start++;
  }

  if (json.startsWith("true", start)) return true;
  if (json.startsWith("false", start)) return false;

  return fallbackValue;
}

int parseJsonInt(String json, const char* key, int fallbackValue) {
  String pattern = String("\"") + key + "\":";
  int start = json.indexOf(pattern);
  if (start < 0) return fallbackValue;

  start += pattern.length();
  while (start < (int)json.length() &&
         (json[start] == ' ' || json[start] == '\n' || json[start] == '\r' || json[start] == '"')) {
    start++;
  }

  int end = start;
  while (end < (int)json.length() && (isDigit(json[end]) || json[end] == '-')) {
    end++;
  }

  String numberStr = json.substring(start, end);
  if (numberStr.length() == 0) return fallbackValue;

  return numberStr.toInt();
}

float parseJsonFloat(String json, const char* key, float fallbackValue) {
  String pattern = String("\"") + key + "\":";
  int start = json.indexOf(pattern);
  if (start < 0) return fallbackValue;

  start += pattern.length();
  while (start < (int)json.length() &&
         (json[start] == ' ' || json[start] == '\n' || json[start] == '\r' || json[start] == '"')) {
    start++;
  }

  int end = start;
  while (end < (int)json.length() &&
         (isDigit(json[end]) || json[end] == '-' || json[end] == '.')) {
    end++;
  }

  String numberStr = json.substring(start, end);
  if (numberStr.length() == 0) return fallbackValue;

  return numberStr.toFloat();
}

String parseJsonString(String json, const char* key, String fallbackValue) {
  String pattern = String("\"") + key + "\":\"";
  int start = json.indexOf(pattern);
  if (start < 0) return fallbackValue;

  start += pattern.length();
  int end = json.indexOf("\"", start);
  if (end < 0) return fallbackValue;

  return json.substring(start, end);
}

// ---------------- RTC SYNC ----------------
bool applyRtcSyncFromJson(const String& body) {
  if (body.length() == 0 || body == "null") return false;

  bool syncRtc = parseJsonBool(body, "syncRtc", false);
  if (!syncRtc) return false;

  int year   = parseJsonInt(body, "year", 26);
  int month  = parseJsonInt(body, "month", 1);
  int day    = parseJsonInt(body, "day", 1);
  int hour   = parseJsonInt(body, "hour", 0);
  int minute = parseJsonInt(body, "minute", 0);
  int second = parseJsonInt(body, "second", 0);

  year   = constrain(year, 0, 99);
  month  = constrain(month, 1, 12);
  day    = constrain(day, 1, 31);
  hour   = constrain(hour, 0, 23);
  minute = constrain(minute, 0, 59);
  second = constrain(second, 0, 59);

  Ds1302::DateTime dt;
  dt.year = year;
  dt.month = month;
  dt.day = day;
  dt.hour = hour;
  dt.minute = minute;
  dt.second = second;
  dt.dow = 1;

  rtc.setDateTime(&dt);

  Serial.println("RTC synced from Firebase");
  Serial.print("New RTC: ");
  Serial.println(getRtcString());

  return true;
}

// ---------------- FIREBASE HTTP ----------------
String makeFirebaseUrl(String path) {
  String url = String(FIREBASE_HOST) + path + ".json";
  if (String(FIREBASE_AUTH).length() > 0) {
    url += "?auth=" + String(FIREBASE_AUTH);
  }
  return url;
}

bool firebasePatch(String path, String jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Firebase skip: WiFi not connected");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = makeFirebaseUrl(path);

  if (!http.begin(client, url)) {
    Serial.println("HTTP begin failed");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int httpCode = http.sendRequest("PATCH", jsonPayload);

  Serial.print("PATCH ");
  Serial.print(path);
  Serial.print(" -> ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("PATCH error: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  return (httpCode >= 200 && httpCode < 300);
}

bool firebasePut(String path, String jsonPayload) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = makeFirebaseUrl(path);

  if (!http.begin(client, url)) {
    Serial.println("HTTP begin failed");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(jsonPayload);

  Serial.print("PUT ");
  Serial.print(path);
  Serial.print(" -> ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("PUT error: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  return (httpCode >= 200 && httpCode < 300);
}

bool firebaseDelete(String path) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = makeFirebaseUrl(path);

  if (!http.begin(client, url)) {
    Serial.println("HTTP begin failed");
    return false;
  }

  int httpCode = http.sendRequest("DELETE");

  Serial.print("DELETE ");
  Serial.print(path);
  Serial.print(" -> ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("DELETE error: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  return (httpCode >= 200 && httpCode < 300);
}

String firebaseGet(String path) {
  if (WiFi.status() != WL_CONNECTED) {
    return "";
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = makeFirebaseUrl(path);

  if (!http.begin(client, url)) {
    Serial.println("HTTP begin failed");
    return "";
  }

  int httpCode = http.GET();
  Serial.print("GET ");
  Serial.print(path);
  Serial.print(" -> ");
  Serial.println(httpCode);

  String body = "";
  if (httpCode > 0) {
    body = http.getString();
  } else {
    Serial.print("GET error: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  return body;
}

// ---------------- CONTROL + SETTINGS POLLING ----------------
void pollManualControlAndRtcSync() {
  String body = firebaseGet("/devices/" + String(DEVICE_ID) + "/control");

  if (body.length() != 0 && body != "null") {
    manualRun = parseJsonBool(body, "manualRun", manualRun);
    manualPwm = constrain(parseJsonInt(body, "manualPwm", manualPwm), 0, 255);

    bool rtcSynced = applyRtcSyncFromJson(body);
    if (rtcSynced) {
      firebasePatch(
        "/devices/" + String(DEVICE_ID) + "/control/rtcSync",
        "{\"syncRtc\":false}"
      );
    }

    Serial.println("Control updated:");
    Serial.print("manualRun = ");
    Serial.println(manualRun ? "true" : "false");
    Serial.print("manualPwm = ");
    Serial.println(manualPwm);
  }

  String settingsBody = firebaseGet("/devices/" + String(DEVICE_ID) + "/settings");
  if (settingsBody.length() != 0 && settingsBody != "null") {
    float newThreshold = parseJsonFloat(
      settingsBody,
      "binFullThresholdGrams",
      binFullThresholdGrams
    );
    binFullThresholdGrams = clampBinThreshold(newThreshold);

    Serial.print("binFullThresholdGrams = ");
    Serial.println(binFullThresholdGrams, 2);
  }
}

// ---------------- SCHEDULE PARSING ----------------
void clearSchedules() {
  scheduleCount = 0;
  for (int i = 0; i < MAX_SCHEDULES; i++) {
    schedules[i].id = "";
    schedules[i].scheduleId = "";
    schedules[i].title = "";
    schedules[i].date = "";
    schedules[i].hour = "";
    schedules[i].minute = "";
    schedules[i].duration = "";
    schedules[i].enabled = false;
    schedules[i].status = "";
    schedules[i].createdAt = 0;
  }
}

bool parseNextScheduleObject(const String& json, int& fromIndex, ScheduleSlot& slot) {
  int keyStart = json.indexOf("\"schedule_", fromIndex);
  if (keyStart < 0) return false;

  int keyEnd = json.indexOf("\"", keyStart + 1);
  if (keyEnd < 0) return false;

  String objKey = json.substring(keyStart + 1, keyEnd);

  int objStart = json.indexOf("{", keyEnd);
  if (objStart < 0) return false;

  int depth = 0;
  int objEnd = -1;
  for (int i = objStart; i < (int)json.length(); i++) {
    if (json[i] == '{') depth++;
    else if (json[i] == '}') {
      depth--;
      if (depth == 0) {
        objEnd = i;
        break;
      }
    }
  }
  if (objEnd < 0) return false;

  String obj = json.substring(objStart, objEnd + 1);

  slot.id = objKey;
  slot.scheduleId = parseJsonString(obj, "scheduleId", objKey);
  slot.title = parseJsonString(obj, "title", "Untitled");
  slot.date = parseJsonString(obj, "date", "");
  slot.hour = parseJsonString(obj, "hour", "00");
  slot.minute = parseJsonString(obj, "minute", "00");
  slot.duration = parseJsonString(obj, "duration", "10");
  slot.enabled = parseJsonBool(obj, "enabled", false);
  slot.status = parseJsonString(obj, "status", "PENDING");
  slot.createdAt = (unsigned long)parseJsonInt(obj, "createdAt", 0);

  fromIndex = objEnd + 1;
  return true;
}

void pollSchedules() {
  String body = firebaseGet("/devices/" + String(DEVICE_ID) + "/schedule/slots");
  clearSchedules();

  if (body.length() == 0 || body == "null") {
    Serial.println("No schedules found");
    return;
  }

  int idx = 0;
  while (scheduleCount < MAX_SCHEDULES) {
    ScheduleSlot slot;
    if (!parseNextScheduleObject(body, idx, slot)) break;

    if (slot.id.length() > 0) {
      schedules[scheduleCount++] = slot;
    }
  }

  Serial.print("Loaded schedules: ");
  Serial.println(scheduleCount);
}

// ---------------- HISTORY WRITES ----------------
String sanitizeKey(String s) {
  s.replace(" ", "_");
  s.replace(":", "-");
  s.replace("/", "-");
  s.replace(".", "-");
  return s;
}

void writeHistoryItem(
  const String& scheduleId,
  const String& title,
  const String& date,
  const String& hour,
  const String& minute,
  const String& duration,
  const String& status
) {
  String historyId = "history_" + sanitizeKey(date) + "_" + hour + minute + "_" + String(millis());

  String payload = "{";
  payload += "\"scheduleId\":\"" + scheduleId + "\",";
  payload += "\"title\":\"" + title + "\",";
  payload += "\"date\":\"" + date + "\",";
  payload += "\"hour\":\"" + hour + "\",";
  payload += "\"minute\":\"" + minute + "\",";
  payload += "\"duration\":\"" + duration + "\",";
  payload += "\"mode\":\"AUTO\",";
  payload += "\"status\":\"" + status + "\",";
  payload += "\"executedAt\":" + String(millis());
  payload += "}";

  firebasePut("/devices/" + String(DEVICE_ID) + "/history/" + historyId, payload);
}

void updateScheduleStatus(const String& scheduleId, const String& status) {
  String path = "/devices/" + String(DEVICE_ID) + "/schedule/slots/" + scheduleId;
  String payload = "{\"status\":\"" + status + "\"}";
  firebasePatch(path, payload);
}

void deleteExecutedSchedule(const String& scheduleId) {
  firebaseDelete("/devices/" + String(DEVICE_ID) + "/schedule/slots/" + scheduleId);
}

// ---------------- STATUS JSON ----------------
String makeStatusJson(long rawValue, float weightGrams, float weightKg, unsigned int distanceCm, String rtcText) {
  unsigned long nowMs = millis();

  String json = "{";
  json += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  json += "\"conveyor\":{";
  json += "\"isOn\":" + String(conveyorIsOn ? "true" : "false") + ",";
  json += "\"lastChanged\":" + String(conveyorLastChanged);
  json += "},";
  json += "\"control\":{";
  json += "\"manualRun\":" + String(manualRun ? "true" : "false") + ",";
  json += "\"manualPwm\":" + String(manualPwm);
  json += "},";
  json += "\"settings\":{";
  json += "\"binFullThresholdGrams\":" + String(binFullThresholdGrams, 2);
  json += "},";
  json += "\"auto\":{";
  json += "\"running\":" + String(autoRunActive ? "true" : "false") + ",";
  json += "\"activeScheduleId\":\"" + activeScheduleId + "\",";
  json += "\"pwm\":" + String(autoRunPwm);
  json += "},";
  json += "\"loadCell\":{";
  json += "\"raw\":" + String(rawValue) + ",";
  json += "\"weightGrams\":" + String(weightGrams, 2) + ",";
  json += "\"weightKg\":" + String(weightKg, 3) + ",";
  json += "\"loadPresent\":" + String(loadPresent ? "true" : "false") + ",";
  json += "\"binFull\":" + String(binFull ? "true" : "false");
  json += "},";
  json += "\"servo\":{";
  json += "\"opened\":" + String(servoOpened ? "true" : "false");
  json += "},";
  json += "\"ultrasonic\":{";
  json += "\"distanceCm\":" + String(distanceCm);
  json += "},";
  json += "\"rtc\":{";
  json += "\"dateTime\":\"" + rtcText + "\"";
  json += "},";
  json += "\"updatedAtMs\":" + String(nowMs);
  json += "}";

  return json;
}

// ---------------- AUTO SCHEDULE LOGIC ----------------
unsigned long scheduleDurationToMs(const String& durationStr) {
  int durationValue = durationStr.toInt();
  if (durationValue <= 0) durationValue = 10;
  return (unsigned long)durationValue * 60UL * 1000UL;
}

void startAutoRun(const ScheduleSlot& slot) {
  autoRunActive = true;
  autoRunStartedAt = millis();
  autoRunDurationMs = scheduleDurationToMs(slot.duration);

  autoRunPwm = constrain(manualPwm, 0, 255);

  activeScheduleId = slot.id;

  updateScheduleStatus(slot.id, "RUNNING");

  writeHistoryItem(
    slot.scheduleId.length() > 0 ? slot.scheduleId : slot.id,
    slot.title,
    slot.date,
    slot.hour,
    slot.minute,
    slot.duration,
    "EXECUTED"
  );

  Serial.println("AUTO RUN STARTED");
  Serial.print("Schedule: ");
  Serial.println(slot.title);
  Serial.print("AUTO PWM = ");
  Serial.println(autoRunPwm);
}

void stopAutoRunCompleted() {
  autoRunActive = false;

  String finishedScheduleId = activeScheduleId;
  deleteExecutedSchedule(finishedScheduleId);

  activeScheduleId = "";
  Serial.println("AUTO RUN COMPLETED");
}

void handleScheduleTriggering() {
  if (manualRun) return;
  if (autoRunActive) return;

  String rtcDate = getRtcDate();
  String rtcHour = getRtcHour();
  String rtcMinute = getRtcMinute();

  for (int i = 0; i < scheduleCount; i++) {
    ScheduleSlot& slot = schedules[i];
    if (!slot.enabled) continue;
    if (slot.date != rtcDate) continue;
    if (slot.hour != rtcHour) continue;
    if (slot.minute != rtcMinute) continue;

    String triggerKey = slot.id + "_" + rtcDate + "_" + rtcHour + "_" + rtcMinute;
    if (triggerKey == lastTriggeredScheduleKey) {
      continue;
    }

    lastTriggeredScheduleKey = triggerKey;
    startAutoRun(slot);
    break;
  }
}

void handleMotorLogic() {
  if (manualRun) {
    autoRunActive = false;
    activeScheduleId = "";
    motorForward(manualPwm);
    return;
  }

  if (autoRunActive) {
    unsigned long elapsed = millis() - autoRunStartedAt;
    if (elapsed < autoRunDurationMs) {
      motorForward(autoRunPwm);
    } else {
      motorStop();
      stopAutoRunCompleted();
    }
    return;
  }

  motorStop();
}

// ---------------- SERVO LOGIC ----------------
void handleServoLogic() {
  if (conveyorIsOn) {
    if (!servoOpened) {
      Serial.println("CONVEYOR ON -> SERVO OPEN");
      openBinServo();
    }
  } else {
    if (servoOpened) {
      Serial.println("CONVEYOR OFF -> SERVO CLOSED");
      closeBinServo();
    }
  }
}

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(REN, OUTPUT);
  pinMode(LEN, OUTPUT);
  digitalWrite(REN, HIGH);
  digitalWrite(LEN, HIGH);

  ledcAttachChannel(RPWM, 1000, 8, 0);
  ledcAttachChannel(LPWM, 1000, 8, 1);

  conveyorIsOn = false;
  conveyorLastChanged = millis();
  motorStop();

  ESP32PWM::allocateTimer(2);
  binServo.setPeriodHertz(50);
  binServo.attach(SERVO_PIN, 544, 2400);
  closeBinServo();

  rtc.init();
  scale.begin(HX_DOUT, HX_SCK);
  scale.set_gain(128); // ← add this


  delay(2000);
  if (scale.is_ready()) {
    Serial.println("Taring HX711...");
    scale.tare(15);
    Serial.println("Tare complete");

    long check = scale.get_value(10);
    Serial.print("Post-tare check: ");
    Serial.println(check);
  } else {
    Serial.println("HX711 not ready during setup");
  }

  connectWiFi();

  firebasePatch(
    "/devices/" + String(DEVICE_ID) + "/control",
    "{\"manualRun\":false,\"manualPwm\":180}"
  );

  String settingsBody = firebaseGet("/devices/" + String(DEVICE_ID) + "/settings");
  if (settingsBody == "" || settingsBody == "null") {
    firebasePatch(
      "/devices/" + String(DEVICE_ID) + "/settings",
      "{\"binFullThresholdGrams\":500}"
    );
  }

  Serial.println("=== WIFI + FIREBASE + RTC SYNC + MANUAL + AUTO + CALIBRATED LOAD CELL + USER BIN FULL THRESHOLD + SERVO ON CONVEYOR ===");
}

// ---------------- LOOP ----------------
void loop() {
  if (millis() - lastWifiCheck > 5000) {
    lastWifiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi disconnected, retrying...");
      connectWiFi();
    }
  }

  if (millis() - lastControlPoll > 2000) {
    lastControlPoll = millis();
    pollManualControlAndRtcSync();
  }

  if (millis() - lastSchedulePoll > 5000) {
    lastSchedulePoll = millis();
    pollSchedules();
  }

  String rtcText = getRtcString();
  unsigned int distanceCm = sonar.ping_cm();

long raw = 0;
if (scale.is_ready()) {
  raw = scale.get_value(5); // ← no minus sign
} else {
  Serial.println("HX711 not ready");
}

  float weightGrams = rawToGrams(raw);

  if (abs(weightGrams) < ZERO_DEADBAND_G) {
    weightGrams = 0;
  }

  if (weightGrams < 0) {
    weightGrams = 0;
  }

  float weightKg = weightGrams / 1000.0;

  updateLoadHysteresis(raw);
  updateBinFullState(weightGrams);

  handleScheduleTriggering();
  handleMotorLogic();
  handleServoLogic();

  Serial.println("------------------------------");
  Serial.print("RTC: ");
  Serial.println(rtcText);

  Serial.print("Ultrasonic (cm): ");
  Serial.println(distanceCm);

  Serial.print("HX711 raw (tare-adjusted): ");
  Serial.println(raw);

  Serial.print("Weight (g): ");
  Serial.println(weightGrams, 2);

  Serial.print("Weight (kg): ");
  Serial.println(weightKg, 3);

  Serial.print("Bin full threshold (g): ");
  Serial.println(binFullThresholdGrams, 2);

  Serial.print("Load present: ");
  Serial.println(loadPresent ? "YES" : "NO");

  Serial.print("Bin full: ");
  Serial.println(binFull ? "YES" : "NO");

  Serial.print("Servo opened: ");
  Serial.println(servoOpened ? "YES" : "NO");

  Serial.print("Manual run: ");
  Serial.println(manualRun ? "YES" : "NO");

  Serial.print("Manual PWM: ");
  Serial.println(manualPwm);

  Serial.print("Auto active: ");
  Serial.println(autoRunActive ? "YES" : "NO");

  Serial.print("Auto PWM: ");
  Serial.println(autoRunPwm);

  Serial.print("Active schedule: ");
  Serial.println(activeScheduleId);

  Serial.print("Conveyor isOn: ");
  Serial.println(conveyorIsOn ? "YES" : "NO");

  Serial.print("WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");

  if (millis() - lastFirebaseSend > 3000) {
    lastFirebaseSend = millis();

    String path = "/devices/" + String(DEVICE_ID) + "/status";
    String payload = makeStatusJson(raw, weightGrams, weightKg, distanceCm, rtcText);

    Serial.println("Sending status JSON:");
    Serial.println(payload);

    firebasePatch(path, payload);
  }

  delay(500);
}