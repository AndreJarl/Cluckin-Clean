// bleTypes.ts
import {Device} from 'react-native-ble-plx';

export type BleMode = 'AUTO' | 'MANUAL';

/**
 * A single cleaning schedule slot stored on the ESP32.
 *
 * daysMask bit layout (7 bits):
 *   bit 0 = Sunday
 *   bit 1 = Monday
 *   …
 *   bit 6 = Saturday
 *
 * Common values:
 *   62  = Mon–Fri   (0b0111110)
 *   65  = Weekends  (0b1000001)
 *   127 = Every day (0b1111111)
 *
 * NOTE: Renamed from `weekdaysMask` to `daysMask` to match new firmware.
 */
export type CleaningSchedule = {
  index: number;       // slot 0–4
  enabled: boolean;
  hour: number;        // 0–23
  minute: number;      // 0–59
  durationSec: number; // how long the motor runs (seconds)
  daysMask: number;    // 7-bit bitmask (was `weekdaysMask`)
};

export type BleContextValue = {
  // ── Connection state ──────────────────────────────────────
  bleReady: boolean;
  isScanning: boolean;
  isConnected: boolean;
  device: Device | null;

  // ── Live data ─────────────────────────────────────────────
  status: string;         // 'RUNNING' | 'STOPPED' | 'CONNECTED' | 'DISCONNECTED'
  mode: BleMode;          // kept for UI compatibility; 'AUTO' when a schedule fires
  weight: string;         // weight in grams as string, e.g. "1234.5"
  weightPct: number;      // 0–100, used for bin gauge
  motorDir: 'FWD' | 'REV';
  motorSpeed: number;     // 0–255
  rtcTime: string;        // "YYYY-MM-DD HH:mm:ss" from device
  lastEvent: string;
  binFullAlert: string | null;
  schedules: CleaningSchedule[];

  // ── Connection ────────────────────────────────────────────
  scanAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;

  // ── Motor ─────────────────────────────────────────────────
  startConveyor: (speed?: number) => Promise<void>;
  stopConveyor: () => Promise<void>;
  motorFwd: () => Promise<void>;
  motorRev: () => Promise<void>;
  runTimed: (secs: number, speed?: number) => Promise<void>;

  // ── Servo ─────────────────────────────────────────────────
  setServo: (angle: number) => Promise<void>;

  // ── Clock ─────────────────────────────────────────────────
  setDeviceTime: (date?: Date) => Promise<void>;
  syncDeviceTimeNow: () => Promise<void>;

  // ── Schedules ─────────────────────────────────────────────
  addSchedule: (schedule: CleaningSchedule) => Promise<void>;
  editSchedule: (schedule: CleaningSchedule) => Promise<void>;
  deleteSchedule: (index: number) => Promise<void>;
  getSchedules: () => Promise<void>;
  clearSchedules: () => Promise<void>;
};