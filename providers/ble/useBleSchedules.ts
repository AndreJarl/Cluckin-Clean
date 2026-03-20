// useBleSchedules.ts
import {useBle} from './useBle';

/**
 * Exposes schedule management.
 *
 * Key change from old version:
 *   CleaningSchedule.weekdaysMask → daysMask
 *
 * daysMask bit layout: bit0=Sun, bit1=Mon, …, bit6=Sat
 *   62  = Mon–Fri   (0b0111110)
 *   65  = Weekends  (0b1000001)
 *   127 = Every day (0b1111111)
 */
export function useBleSchedules() {
  const {
    schedules,
    addSchedule,
    editSchedule,
    deleteSchedule,
    getSchedules,
    clearSchedules,
  } = useBle();

  return {
    schedules,
    addSchedule,
    editSchedule,
    deleteSchedule,
    getSchedules,
    clearSchedules,
  };
}