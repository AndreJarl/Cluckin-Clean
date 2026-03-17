import {Device} from 'react-native-ble-plx';

export type BleMode = 'AUTO' | 'MANUAL';

export type CleaningSchedule = {
  id: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  repeatDaily: boolean;
  enabled: boolean;
  durationMs: number;
};

export type BleContextValue = {
  bleReady: boolean;
  isScanning: boolean;
  isConnected: boolean;
  device: Device | null;
  status: string;
  mode: BleMode;
  weight: string;
  lastEvent: string;
  binFullAlert: string | null;
  schedules: CleaningSchedule[];

  scanAndConnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendCommand: (command: string) => Promise<void>;

  requestStatus: () => Promise<void>;
  requestWeight: () => Promise<void>;
  tareScale: () => Promise<void>;
  startConveyor: () => Promise<void>;
  stopConveyor: () => Promise<void>;
  setAutoMode: () => Promise<void>;

  setDeviceTime: (date?: Date) => Promise<void>;
  syncDeviceTimeNow: () => Promise<void>;

  addSchedule: (schedule: CleaningSchedule) => Promise<void>;
  editSchedule: (schedule: CleaningSchedule) => Promise<void>;
  deleteSchedule: (id: number) => Promise<void>;
  getSchedules: () => Promise<void>;
  clearSchedules: () => Promise<void>;
};