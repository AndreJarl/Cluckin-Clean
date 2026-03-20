// bleHelpers.ts
import {PermissionsAndroid, Platform} from 'react-native';
import {Buffer} from 'buffer';
import {CleaningSchedule} from './bleTypes';

global.Buffer = global.Buffer ?? Buffer;

// ── Device & Service ──────────────────────────────────────────
export const DEVICE_NAME  = 'ChickenCleaner';
export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';

// ── Characteristics ───────────────────────────────────────────
// Each function writes to / reads from its own characteristic.
export const CHAR_MOTOR    = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'; // Write
export const CHAR_WEIGHT   = 'beb5483e-36e1-4688-b7f5-ea07361b26a9'; // Read + Notify
export const CHAR_SCHEDULE = 'beb5483e-36e1-4688-b7f5-ea07361b26aa'; // Read + Write + Notify
export const CHAR_ALERT    = 'beb5483e-36e1-4688-b7f5-ea07361b26ab'; // Notify
export const CHAR_STATUS   = 'beb5483e-36e1-4688-b7f5-ea07361b26ac'; // Read + Notify
export const CHAR_SERVO    = 'beb5483e-36e1-4688-b7f5-ea07361b26ad'; // Write
export const CHAR_RTC_SYNC = 'beb5483e-36e1-4688-b7f5-ea07361b26ae'; // Write + Read

// ── Base64 (unchanged) ────────────────────────────────────────
export function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

export function decodeBase64(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

// ── Motor commands → write to CHAR_MOTOR ─────────────────────
// Format: plain strings, NOT JSON
export const buildMotorOnCommand  = (speed = 200) => `ON:${speed}`;
export const buildMotorOffCommand = ()             => 'OFF';
export const buildMotorFwdCommand = ()             => 'FWD';
export const buildMotorRevCommand = ()             => 'REV';

// Timed run: motor runs for `secs` seconds then auto-stops
export const buildTimedRunCommand = (secs: number, speed = 200) =>
  `RUN:${secs}:${speed}`;

// ── Servo command → write to CHAR_SERVO ──────────────────────
// Write angle as plain number string "0"–"180"
export const buildSetServoCommand = (angle: number) =>
  String(Math.max(0, Math.min(180, angle)));

// ── Schedule commands → write to CHAR_SCHEDULE ───────────────
// "SET:id,hour,min,daysMask,durationSec,enabled"
// daysMask bit layout: bit0=Sun, bit1=Mon, …, bit6=Sat
//   62  = Mon–Fri  (0b0111110)
//   65  = Weekends (0b1000001)
//   127 = Every day
export function buildSetScheduleCommand(schedule: CleaningSchedule): string {
  return [
    'SET',
    `${schedule.index},${schedule.hour},${schedule.minute}`,
    `${schedule.daysMask},${schedule.durationSec}`,
    `${schedule.enabled ? 1 : 0}`,
  ].join(':').replace(/:/g, (m, i) => (i === 3 ? ':' : i === 0 ? ':' : ','));
  // Cleaner version:
}

// Simpler, explicit build:
export function buildSetScheduleCmd(s: CleaningSchedule): string {
  return `SET:${s.index},${s.hour},${s.minute},${s.daysMask},${s.durationSec},${s.enabled ? 1 : 0}`;
}

export function buildRemoveScheduleCommand(index: number): string {
  return `DEL:${index}`;
}

export function buildGetSchedulesCommand(): string {
  return 'GET';
}

// ── RTC sync → write to CHAR_RTC_SYNC ────────────────────────
// Format: "YYYY,MM,DD,HH,mm,SS,DOW"
// DOW: 1=Mon, 2=Tue, …, 6=Sat, 7=Sun  (DS1302 convention)
export function buildSetTimeCommand(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const dow = date.getDay() === 0 ? 7 : date.getDay(); // JS: 0=Sun → DS1302: 7=Sun
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    dow,
  ].join(',');
}

// ── Permissions (Android 12+ and older) ──────────────────────
export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    // Android 12+
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(result).every(
      v => v === PermissionsAndroid.RESULTS.GRANTED,
    );
  }

  // Android < 12: needs location for BLE scan
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

// ── Removed from old firmware (no longer used) ────────────────
// buildGetStatusCommand  → status is pushed by ESP every 10 s via CHAR_STATUS
// buildTareCommand       → tare not supported in new firmware via BLE
// buildSetAutoModeCommand→ auto/manual mode replaced by schedule system
// buildGetHistoryCommand → not implemented in new firmware