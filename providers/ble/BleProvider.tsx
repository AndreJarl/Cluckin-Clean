// BleProvider.tsx
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
  buildGetSchedulesCommand,
  buildMotorFwdCommand,
  buildMotorOffCommand,
  buildMotorOnCommand,
  buildMotorRevCommand,
  buildRemoveScheduleCommand,
  buildSetScheduleCmd,
  buildSetServoCommand,
  buildSetTimeCommand,
  buildTimedRunCommand,
  CHAR_ALERT,
  CHAR_MOTOR,
  CHAR_RTC_SYNC,
  CHAR_SCHEDULE,
  CHAR_SERVO,
  CHAR_STATUS,
  CHAR_WEIGHT,
  decodeBase64,
  DEVICE_NAME,
  encodeBase64,
  requestBlePermissions,
  SERVICE_UUID,
} from './bleHelpers';

export const BleContext = createContext<BleContextValue | null>(null);

export function BleProvider({children}: {children: React.ReactNode}) {
  const managerRef       = useRef<BleManager | null>(null);
  const notifySubsRef    = useRef<Subscription[]>([]);
  const disconnectSubRef = useRef<Subscription | null>(null);
  const scanTimeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef     = useRef(false);
  // deviceRef mirrors device state but updates SYNCHRONOUSLY.
  // writeToChar reads this ref so it never closes over a stale null
  // when called right after setDevice() inside scanAndConnect.
  const deviceRef        = useRef<Device | null>(null);

  const [bleReady,    setBleReady]    = useState(false);
  const [isScanning,  setIsScanning]  = useState(false);
  const [device,      setDevice]      = useState<Device | null>(null);
  const [status,      setStatus]      = useState('DISCONNECTED');
  const [mode,        setMode]        = useState<BleMode>('MANUAL');
  const [weight,      setWeight]      = useState('0.0');
  const [weightPct,   setWeightPct]   = useState(0);
  const [motorDir,    setMotorDir]    = useState<'FWD' | 'REV'>('FWD');
  const [motorSpeed,  setMotorSpeed]  = useState(200);
  const [rtcTime,     setRtcTime]     = useState('');
  const [lastEvent,   setLastEvent]   = useState('Idle');
  const [binFullAlert, setBinFullAlert] = useState<string | null>(null);
  const [schedules,   setSchedules]   = useState<CleaningSchedule[]>([]);

  // ── BleManager lifecycle ────────────────────────────────────
  useEffect(() => {
    const manager = new BleManager();
    managerRef.current = manager;
    destroyedRef.current = false;

    const stateSub = manager.onStateChange((state: State) => {
      setBleReady(state === State.PoweredOn);
    }, true);

    return () => {
      stateSub.remove();
      cleanupAllSubs();

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }

      const m = managerRef.current;
      managerRef.current = null;
      if (m && !destroyedRef.current) {
        destroyedRef.current = true;
        m.destroy().catch(e => console.log('BleManager destroy =>', e));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup helpers ─────────────────────────────────────────
  const cleanupAllSubs = useCallback(() => {
    notifySubsRef.current.forEach(s => s.remove());
    notifySubsRef.current = [];
    disconnectSubRef.current?.remove();
    disconnectSubRef.current = null;
  }, []);

  // ── Low-level: write to a specific characteristic ───────────
  // Uses deviceRef (not device state) so it works immediately after
  // setDevice() is called — React state updates are async/batched.
  const writeToChar = useCallback(
    async (charUUID: string, command: string) => {
      const manager     = managerRef.current;
      const currentDevice = deviceRef.current;   // ← ref, always up-to-date
      if (!manager || !currentDevice) {
        throw new Error('No BLE device connected');
      }
      console.log(`[BLE] → ${charUUID.slice(-4)} | ${command}`);
      await manager.writeCharacteristicWithResponseForDevice(
        currentDevice.id,
        SERVICE_UUID,
        charUUID,
        encodeBase64(command),
      );
    },
    [], // no dependency on device state — reads ref directly
  );

  // ── Low-level: add a notify subscription for one characteristic ─
  const addMonitor = useCallback(
    (connectedDevice: Device, charUUID: string, onValue: (v: string) => void) => {
      const manager = managerRef.current;
      if (!manager) return;

      const sub = manager.monitorCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        charUUID,
        (error, characteristic: Characteristic | null) => {
          if (error) {
            console.log(`[BLE] monitor error (${charUUID.slice(-4)}) =>`, error.message);
            return;
          }
          if (!characteristic?.value) return;
          const decoded = decodeBase64(characteristic.value);
          console.log(`[BLE] ← ${charUUID.slice(-4)} | ${decoded}`);
          onValue(decoded);
        },
      );
      notifySubsRef.current.push(sub);
    },
    [],
  );

  // ── Notification handlers ───────────────────────────────────

  /** {"g":1234.5,"pct":24.7} */
  const handleWeight = useCallback((raw: string) => {
    try {
      const obj = JSON.parse(raw);
      const g   = Number(obj.g   ?? 0);
      const pct = Number(obj.pct ?? 0);
      setWeight(g.toFixed(1));
      setWeightPct(Math.min(100, Math.max(0, pct)));
      if (pct >= 80) {
        setBinFullAlert(`Bin ${pct.toFixed(0)}% full — ${g.toFixed(0)} g`);
      } else {
        setBinFullAlert(null);
      }
    } catch (e) {
      console.log('[BLE] weight parse error =>', e, raw);
    }
  }, []);

  /** Plain alert strings: "BIN_FULL:87%", "SCH_START:2", "MOTOR_DONE", etc. */
  const handleAlert = useCallback((raw: string) => {
    const msg = raw.trim();
    setLastEvent(msg);

    if (msg.startsWith('BIN_FULL')) {
      setBinFullAlert(msg.replace('BIN_FULL:', 'Bin full — '));
    } else if (msg === 'MOTOR_DONE') {
      setStatus(prev => (prev === 'RUNNING' ? 'STOPPED' : prev));
      setMode('MANUAL');
    } else if (msg.startsWith('SCH_START')) {
      setMode('AUTO');
      setStatus('RUNNING');
    } else if (msg.startsWith('SCH_SAVED') || msg === 'RTC_SYNCED') {
      // informational — lastEvent is already set
    }
  }, []);

  /** {"motor":true,"spd":200,"dir":"FWD","time":"2025-06-01 08:00:00"} */
  const handleStatus = useCallback((raw: string) => {
    try {
      const obj = JSON.parse(raw);
      const running = !!obj.motor;
      setStatus(running ? 'RUNNING' : 'STOPPED');
      setMotorDir((obj.dir === 'REV' ? 'REV' : 'FWD') as 'FWD' | 'REV');
      setMotorSpeed(Number(obj.spd ?? 200));
      if (obj.time) setRtcTime(String(obj.time));
    } catch (e) {
      console.log('[BLE] status parse error =>', e, raw);
    }
  }, []);

  /**
   * Schedule list from ESP32:
   * [{"id":0,"hour":8,"min":0,"days":126,"dur":60,"en":true}, …]
   *
   * Maps firmware field names → CleaningSchedule type:
   *   id   → index
   *   min  → minute
   *   days → daysMask
   *   dur  → durationSec
   *   en   → enabled
   */
  const handleSchedules = useCallback((raw: string) => {
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      const parsed: CleaningSchedule[] = arr.map((item: any) => ({
        index      : Number(item.id    ?? item.index ?? 0),
        hour       : Number(item.hour  ?? 0),
        minute     : Number(item.min   ?? item.minute ?? 0),
        daysMask   : Number(item.days  ?? item.daysMask ?? 0),
        durationSec: Number(item.dur   ?? item.durationSec ?? 0),
        enabled    : Boolean(item.en   ?? item.enabled ?? false),
      }));
      console.log('[BLE] parsed schedules =>', parsed);
      setSchedules(parsed);
      setLastEvent(`Loaded ${parsed.length} schedules`);
    } catch (e) {
      console.log('[BLE] schedule parse error =>', e, raw);
    }
  }, []);

  // ── Wire up all notify subscriptions after connecting ────────
  const monitorAllCharacteristics = useCallback(
    (connectedDevice: Device) => {
      addMonitor(connectedDevice, CHAR_WEIGHT,   handleWeight);
      addMonitor(connectedDevice, CHAR_ALERT,    handleAlert);
      addMonitor(connectedDevice, CHAR_STATUS,   handleStatus);
      addMonitor(connectedDevice, CHAR_SCHEDULE, handleSchedules);
    },
    [addMonitor, handleWeight, handleAlert, handleStatus, handleSchedules],
  );

  // ── Watch for unexpected disconnection ───────────────────────
  const watchDisconnect = useCallback(
    (connectedDevice: Device) => {
      const manager = managerRef.current;
      if (!manager) return;

      disconnectSubRef.current?.remove();
      disconnectSubRef.current = manager.onDeviceDisconnected(
        connectedDevice.id,
        error => {
          cleanupAllSubs();
          deviceRef.current = null;   // clear ref on unexpected drop
          setSchedules([]);
          setDevice(null);
          setStatus('DISCONNECTED');
          setRtcTime('');
          setLastEvent(error ? `Disconnected: ${error.message}` : 'Disconnected');
        },
      );
    },
    [cleanupAllSubs],
  );

  // ── Motor commands ───────────────────────────────────────────
  const startConveyor = useCallback(
    async (speed = 200) => writeToChar(CHAR_MOTOR, buildMotorOnCommand(speed)),
    [writeToChar],
  );

  const stopConveyor = useCallback(
    async () => writeToChar(CHAR_MOTOR, buildMotorOffCommand()),
    [writeToChar],
  );

  const motorFwd = useCallback(
    async () => writeToChar(CHAR_MOTOR, buildMotorFwdCommand()),
    [writeToChar],
  );

  const motorRev = useCallback(
    async () => writeToChar(CHAR_MOTOR, buildMotorRevCommand()),
    [writeToChar],
  );

  const runTimed = useCallback(
    async (secs: number, speed = 200) =>
      writeToChar(CHAR_MOTOR, buildTimedRunCommand(secs, speed)),
    [writeToChar],
  );

  // ── Servo ────────────────────────────────────────────────────
  const setServo = useCallback(
    async (angle: number) => writeToChar(CHAR_SERVO, buildSetServoCommand(angle)),
    [writeToChar],
  );

  // ── Clock ────────────────────────────────────────────────────
  const setDeviceTime = useCallback(
    async (date: Date = new Date()) =>
      writeToChar(CHAR_RTC_SYNC, buildSetTimeCommand(date)),
    [writeToChar],
  );

  const syncDeviceTimeNow = useCallback(
    async () => setDeviceTime(new Date()),
    [setDeviceTime],
  );

  // ── Schedules ─────────────────────────────────────────────────
  const getSchedules = useCallback(
    async () => writeToChar(CHAR_SCHEDULE, buildGetSchedulesCommand()),
    [writeToChar],
  );

  const addSchedule = useCallback(
    async (schedule: CleaningSchedule) => {
      await writeToChar(CHAR_SCHEDULE, buildSetScheduleCmd(schedule));
      await new Promise(r => setTimeout(r, 120));
      await getSchedules();
    },
    [writeToChar, getSchedules],
  );

  const editSchedule = useCallback(
    async (schedule: CleaningSchedule) => {
      await writeToChar(CHAR_SCHEDULE, buildSetScheduleCmd(schedule));
      await new Promise(r => setTimeout(r, 120));
      await getSchedules();
    },
    [writeToChar, getSchedules],
  );

  const deleteSchedule = useCallback(
    async (index: number) => {
      await writeToChar(CHAR_SCHEDULE, buildRemoveScheduleCommand(index));
      await new Promise(r => setTimeout(r, 120));
      await getSchedules();
    },
    [writeToChar, getSchedules],
  );

  const clearSchedules = useCallback(async () => {
    for (const s of schedules) {
      await writeToChar(CHAR_SCHEDULE, buildRemoveScheduleCommand(s.index));
      await new Promise(r => setTimeout(r, 80));
    }
    await getSchedules();
  }, [schedules, writeToChar, getSchedules]);

  // ── Disconnect ────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager || !deviceRef.current) return;
    cleanupAllSubs();
    setSchedules([]);
    try {
      await manager.cancelDeviceConnection(deviceRef.current.id);
    } catch (e) {
      console.log('cancelDeviceConnection =>', e);
    }
    deviceRef.current = null;   // clear ref before state
    setDevice(null);
    setStatus('DISCONNECTED');
    setRtcTime('');
    setLastEvent('Disconnected');
  }, [cleanupAllSubs]);

  // ── Scan and connect ──────────────────────────────────────────
  const scanAndConnect = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) throw new Error('BLE manager not initialized');

    const granted = await requestBlePermissions();
    if (!granted) throw new Error('Bluetooth permissions not granted');

    const state = await manager.state();
    if (state !== State.PoweredOn) throw new Error('Bluetooth is not powered on');

    if (device) {
      setLastEvent('Already connected');
      return;
    }

    setIsScanning(true);
    setLastEvent(`Scanning for ${DEVICE_NAME}…`);

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (cb: () => void) => {
        if (settled) return;
        settled = true;
        manager.stopDeviceScan();
        if (scanTimeoutRef.current) {
          clearTimeout(scanTimeoutRef.current);
          scanTimeoutRef.current = null;
        }
        setIsScanning(false);
        cb();
      };

      scanTimeoutRef.current = setTimeout(() => {
        finish(() => reject(new Error('Scan timeout: device not found')));
      }, 12000);

      manager.startDeviceScan(null, null, async (error, scannedDevice) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        const name = scannedDevice?.name ?? scannedDevice?.localName;
        if (name !== DEVICE_NAME) return;

        finish(async () => {
          try {
            if (!scannedDevice) throw new Error('Scanned device is undefined');

            const connected  = await scannedDevice.connect();
            const discovered = await connected.discoverAllServicesAndCharacteristics();

            // Update ref FIRST (synchronous) so writeToChar can use it
            // immediately. setDevice() triggers a re-render but is async.
            deviceRef.current = discovered;
            setDevice(discovered);
            setStatus('CONNECTED');
            setLastEvent(`Connected to ${name}`);

            // Wire up all notifications
            monitorAllCharacteristics(discovered);
            watchDisconnect(discovered);

            // Sync RTC immediately
            await new Promise(r => setTimeout(r, 200));
            await syncDeviceTimeNow();

            // Request initial schedules
            // (status + weight come in automatically via notify)
            await new Promise(r => setTimeout(r, 120));
            await writeToChar(CHAR_SCHEDULE, buildGetSchedulesCommand());

            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  }, [
    device,
    monitorAllCharacteristics,
    watchDisconnect,
    syncDeviceTimeNow,
    writeToChar,
  ]);

  // ── Context value ─────────────────────────────────────────────
  const value = useMemo<BleContextValue>(
    () => ({
      bleReady,
      isScanning,
      isConnected : !!device,
      device,
      status,
      mode,
      weight,
      weightPct,
      motorDir,
      motorSpeed,
      rtcTime,
      lastEvent,
      binFullAlert,
      schedules,

      scanAndConnect,
      disconnect,

      startConveyor,
      stopConveyor,
      motorFwd,
      motorRev,
      runTimed,

      setServo,

      setDeviceTime,
      syncDeviceTimeNow,

      addSchedule,
      editSchedule,
      deleteSchedule,
      getSchedules,
      clearSchedules,
    }),
    [
      bleReady, isScanning, device, status, mode, weight, weightPct,
      motorDir, motorSpeed, rtcTime, lastEvent, binFullAlert, schedules,
      scanAndConnect, disconnect,
      startConveyor, stopConveyor, motorFwd, motorRev, runTimed,
      setServo,
      setDeviceTime, syncDeviceTimeNow,
      addSchedule, editSchedule, deleteSchedule, getSchedules, clearSchedules,
    ],
  );

  return <BleContext.Provider value={value}>{children}</BleContext.Provider>;
}