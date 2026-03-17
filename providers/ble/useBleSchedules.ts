import {useBle} from './useBle';

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