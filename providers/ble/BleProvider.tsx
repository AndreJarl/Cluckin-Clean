import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BleManager,
  Characteristic,
  Device,
  State,
  Subscription,
} from 'react-native-ble-plx';
import {BleContextValue, BleMode, CleaningSchedule} from './bleTypes';
import {
  buildScheduleCommand,
  buildSetTimeCommand,
  CMD_UUID,
  decodeBase64,
  DEVICE_NAME,
  encodeBase64,
  NOTIFY_UUID,
  requestBlePermissions,
  SERVICE_UUID,
} from './bleHelpers';

export const BleContext = createContext<BleContextValue | null>(null);

export function BleProvider({children}: {children: React.ReactNode}) {
  const managerRef = useRef<BleManager | null>(null);
  const notifySubRef = useRef<Subscription | null>(null);
  const disconnectSubRef = useRef<Subscription | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingSchedulesRef = useRef<CleaningSchedule[]>([]);
  const expectedScheduleCountRef = useRef<number | null>(null);

  const [bleReady, setBleReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [status, setStatus] = useState('DISCONNECTED');
  const [mode, setMode] = useState<BleMode>('AUTO');
  const [weight, setWeight] = useState('0.0');
  const [lastEvent, setLastEvent] = useState('Idle');
  const [binFullAlert, setBinFullAlert] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<CleaningSchedule[]>([]);

  useEffect(() => {
    const manager = new BleManager();
    managerRef.current = manager;

    const sub = manager.onStateChange((state: State) => {
      setBleReady(state === State.PoweredOn);
    }, true);

    return () => {
      sub.remove();
      notifySubRef.current?.remove();
      disconnectSubRef.current?.remove();

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }

      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  const cleanupSubscriptions = useCallback(() => {
    notifySubRef.current?.remove();
    notifySubRef.current = null;

    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
  }, []);

  const resetScheduleCollection = useCallback(() => {
    pendingSchedulesRef.current = [];
    expectedScheduleCountRef.current = null;
  }, []);

  const handleNotifyMessage = useCallback((message: string) => {
    const parts = message.split(',');
    const type = parts[0];

    switch (type) {
      case 'CONVEYOR_ON':
        setStatus('RUNNING');
        setLastEvent('Conveyor started');
        return;

      case 'CONVEYOR_OFF':
        setStatus('STOPPED');
        setLastEvent('Conveyor stopped');
        return;

      case 'AUTO_MODE':
        setMode('AUTO');
        setLastEvent('Auto mode enabled');
        return;

      case 'STATUS':
        setMode((parts[1] as BleMode) || 'AUTO');
        setStatus(parts[2] || 'UNKNOWN');
        setLastEvent(`Status: ${parts[1] || '-'} / ${parts[2] || '-'}`);
        return;

      case 'WEIGHT':
        setWeight(parts[1] || '0.0');
        return;

      case 'TARE_OK':
        setWeight('0.0');
        setLastEvent('Scale tared');
        return;

      case 'TIME_SET_OK':
        setLastEvent('Device time synced');
        return;

      case 'TIME_SET_ERROR':
        setLastEvent('Device time sync failed');
        return;

      case 'BIN_FULL':
        setWeight(parts[1] || '0.0');
        setBinFullAlert(`Waste bin full: ${parts[1] || '?'} g`);
        setLastEvent('Waste bin threshold exceeded');
        return;

      case 'SCHEDULE_TRIGGERED':
        setLastEvent(
          `Schedule ${parts[1] || '?'} triggered on ${parts[2] || '-'} ${parts[3] || '-'}`,
        );
        return;

      case 'ADD_SCHEDULE_OK':
      case 'EDIT_SCHEDULE_OK':
      case 'DELETE_SCHEDULE_OK':
      case 'CLEAR_SCHEDULES_OK':
        setLastEvent(message);
        return;

      case 'ADD_SCHEDULE_ERROR':
      case 'EDIT_SCHEDULE_ERROR':
      case 'DELETE_SCHEDULE_ERROR':
      case 'ERROR':
        setLastEvent(message);
        return;

      case 'SCHEDULE_COUNT': {
        const count = Number(parts[1] || 0);
        expectedScheduleCountRef.current = count;
        pendingSchedulesRef.current = [];

        if (count === 0) {
          setSchedules([]);
          setLastEvent('No schedules saved');
        }
        return;
      }

      case 'SCHEDULE': {
        const schedule: CleaningSchedule = {
          id: Number(parts[1] || 0),
          year: Number(parts[2] || 0),
          month: Number(parts[3] || 0),
          day: Number(parts[4] || 0),
          hour: Number(parts[5] || 0),
          minute: Number(parts[6] || 0),
          repeatDaily: parts[7] === '1',
          enabled: parts[8] === '1',
          durationMs: Number(parts[9] || 0),
        };

        pendingSchedulesRef.current = [...pendingSchedulesRef.current, schedule];

        const expected = expectedScheduleCountRef.current;
        if (
          typeof expected === 'number' &&
          pendingSchedulesRef.current.length >= expected
        ) {
          setSchedules([...pendingSchedulesRef.current]);
          setLastEvent(`Loaded ${pendingSchedulesRef.current.length} schedules`);
        }
        return;
      }

      default:
        setLastEvent(message);
    }
  }, []);

  const monitorNotifications = useCallback(
    (connectedDevice: Device) => {
      const manager = managerRef.current;
      if (!manager) {
        throw new Error('BLE manager not initialized');
      }

      notifySubRef.current?.remove();

      notifySubRef.current = manager.monitorCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        NOTIFY_UUID,
        (error, characteristic: Characteristic | null) => {
          if (error) {
            setLastEvent(`Notify error: ${error.message}`);
            return;
          }

          if (!characteristic?.value) return;

          const decoded = decodeBase64(characteristic.value);
          handleNotifyMessage(decoded);
        },
      );
    },
    [handleNotifyMessage],
  );

  const watchDisconnect = useCallback(
    (connectedDevice: Device) => {
      const manager = managerRef.current;
      if (!manager) {
        throw new Error('BLE manager not initialized');
      }

      disconnectSubRef.current?.remove();

      disconnectSubRef.current = manager.onDeviceDisconnected(
        connectedDevice.id,
        error => {
          cleanupSubscriptions();
          setDevice(null);
          setStatus('DISCONNECTED');

          if (error) {
            setLastEvent(`Disconnected: ${error.message}`);
          } else {
            setLastEvent('Disconnected');
          }
        },
      );
    },
    [cleanupSubscriptions],
  );

  const sendCommand = useCallback(
    async (command: string) => {
      const manager = managerRef.current;
      if (!manager || !device) {
        throw new Error('No BLE device connected');
      }

      await manager.writeCharacteristicWithResponseForDevice(
        device.id,
        SERVICE_UUID,
        CMD_UUID,
        encodeBase64(command),
      );
    },
    [device],
  );

  const requestStatus = useCallback(async () => {
    await sendCommand('STATUS');
  }, [sendCommand]);

  const requestWeight = useCallback(async () => {
    await sendCommand('WEIGHT?');
  }, [sendCommand]);

  const tareScale = useCallback(async () => {
    await sendCommand('TARE');
  }, [sendCommand]);

  const startConveyor = useCallback(async () => {
    await sendCommand('START');
  }, [sendCommand]);

  const stopConveyor = useCallback(async () => {
    await sendCommand('STOP');
  }, [sendCommand]);

  const setAutoMode = useCallback(async () => {
    await sendCommand('AUTO');
  }, [sendCommand]);

  const setDeviceTime = useCallback(
    async (date: Date = new Date()) => {
      await sendCommand(buildSetTimeCommand(date));
    },
    [sendCommand],
  );

  const syncDeviceTimeNow = useCallback(async () => {
    await setDeviceTime(new Date());
  }, [setDeviceTime]);

  const getSchedules = useCallback(async () => {
    resetScheduleCollection();
    await sendCommand('GET_SCHEDULES');
  }, [resetScheduleCollection, sendCommand]);

  const clearSchedules = useCallback(async () => {
    await sendCommand('CLEAR_SCHEDULES');
    setSchedules([]);
    resetScheduleCollection();
  }, [resetScheduleCollection, sendCommand]);

  const addSchedule = useCallback(
    async (schedule: CleaningSchedule) => {
      await sendCommand(buildScheduleCommand('ADD_SCHEDULE', schedule));
      await new Promise(resolve => setTimeout(resolve, 150));
      await getSchedules();
    },
    [getSchedules, sendCommand],
  );

  const editSchedule = useCallback(
    async (schedule: CleaningSchedule) => {
      await sendCommand(buildScheduleCommand('EDIT_SCHEDULE', schedule));
      await new Promise(resolve => setTimeout(resolve, 150));
      await getSchedules();
    },
    [getSchedules, sendCommand],
  );

  const deleteSchedule = useCallback(
    async (id: number) => {
      await sendCommand(`DELETE_SCHEDULE,${id}`);
      await new Promise(resolve => setTimeout(resolve, 150));
      await getSchedules();
    },
    [getSchedules, sendCommand],
  );

  const disconnect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager || !device) return;

    cleanupSubscriptions();

    try {
      await manager.cancelDeviceConnection(device.id);
    } catch {
      // ignore
    }

    setDevice(null);
    setStatus('DISCONNECTED');
    setLastEvent('Disconnected');
  }, [cleanupSubscriptions, device]);

  const scanAndConnect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) {
      throw new Error('BLE manager not initialized');
    }

    const granted = await requestBlePermissions();
    if (!granted) {
      throw new Error('Bluetooth permissions not granted');
    }

    const state = await manager.state();
    if (state !== State.PoweredOn) {
      throw new Error('Bluetooth is not powered on');
    }

    if (device) {
      setLastEvent('Already connected');
      return;
    }

    setIsScanning(true);
    setLastEvent('Scanning for ESP32...');

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;

        manager.stopDeviceScan();

        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = null;
        }

        setIsScanning(false);
        callback();
      };

      scanTimeoutRef.current = setTimeout(() => {
        finish(() => reject(new Error('Scan timeout: device not found')));
      }, 12000);

      manager.startDeviceScan(null, null, async (error, scannedDevice) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        const name = scannedDevice?.name || scannedDevice?.localName;
        if (name !== DEVICE_NAME) return;

   finish(async () => {
    try {
      if (!scannedDevice) {
        throw new Error('Scanned device is undefined');
      }

      const connected = await scannedDevice.connect();
      const discovered =
        await connected.discoverAllServicesAndCharacteristics();

      setDevice(discovered);
      setStatus('CONNECTED');
      setLastEvent(`Connected to ${name}`);

      monitorNotifications(discovered);
      watchDisconnect(discovered);

      await new Promise(resolve => setTimeout(resolve, 150));

      await syncDeviceTimeNow();
      await new Promise(resolve => setTimeout(resolve, 120));

      await requestStatus();
      await new Promise(resolve => setTimeout(resolve, 120));

      await requestWeight();
      await new Promise(resolve => setTimeout(resolve, 120));

      await getSchedules();

      resolve();
    } catch (e) {
      reject(e);
    }
  });
      });
    });
  }, [
    device,
    getSchedules,
    monitorNotifications,
    requestStatus,
    requestWeight,
    syncDeviceTimeNow,
    watchDisconnect,
  ]);

  const value = useMemo<BleContextValue>(
    () => ({
      bleReady,
      isScanning,
      isConnected: !!device,
      device,
      status,
      mode,
      weight,
      lastEvent,
      binFullAlert,
      schedules,

      scanAndConnect,
      disconnect,
      sendCommand,

      requestStatus,
      requestWeight,
      tareScale,
      startConveyor,
      stopConveyor,
      setAutoMode,

      setDeviceTime,
      syncDeviceTimeNow,

      addSchedule,
      editSchedule,
      deleteSchedule,
      getSchedules,
      clearSchedules,
    }),
    [
      bleReady,
      isScanning,
      device,
      status,
      mode,
      weight,
      lastEvent,
      binFullAlert,
      schedules,
      scanAndConnect,
      disconnect,
      sendCommand,
      requestStatus,
      requestWeight,
      tareScale,
      startConveyor,
      stopConveyor,
      setAutoMode,
      setDeviceTime,
      syncDeviceTimeNow,
      addSchedule,
      editSchedule,
      deleteSchedule,
      getSchedules,
      clearSchedules,
    ],
  );

  return <BleContext.Provider value={value}>{children}</BleContext.Provider>;
}