import {PermissionsAndroid, Platform} from 'react-native';
import {Buffer} from 'buffer';
import {CleaningSchedule} from './bleTypes';

global.Buffer = global.Buffer ?? Buffer;

export const DEVICE_NAME = 'ESP32_WASTE_CLEANER';
export const SERVICE_UUID = '7A000001-0000-1000-8000-00805F9B34FB';
export const CMD_UUID = '7A000002-0000-1000-8000-00805F9B34FB';
export const NOTIFY_UUID = '7A000003-0000-1000-8000-00805F9B34FB';


export function encodeBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

export function decodeBase64(value: string) {
  return Buffer.from(value, 'base64').toString('utf8');
}

export function buildScheduleCommand(
  action: 'ADD_SCHEDULE' | 'EDIT_SCHEDULE',
  schedule: CleaningSchedule,
) {
  return [
    action,
    schedule.id,
    schedule.year,
    schedule.month,
    schedule.day,
    schedule.hour,
    schedule.minute,
    schedule.repeatDaily ? 1 : 0,
    schedule.enabled ? 1 : 0,
    schedule.durationMs,
  ].join(',');
}

export function buildSetTimeCommand(date: Date = new Date()) {
  return [
    'SET_TIME',
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ].join(',');
}

export async function requestBlePermissions() {
  if (Platform.OS !== 'android') return true;

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    return Object.values(result).every(
      value => value === PermissionsAndroid.RESULTS.GRANTED,
    );
  }

  return true;
}