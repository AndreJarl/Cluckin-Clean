// useBleCommands.ts
import {useBle} from './useBle';

/**
 * Exposes all motor, servo, and connection controls.
 *
 * Removed from old version (not supported by new firmware):
 *   - setAutoMode      → mode is now implicit (schedule fires = AUTO, manual = MANUAL)
 *   - tareScale        → tare not exposed via BLE in new firmware
 *   - requestStatus    → status is pushed automatically every 10 s via CHAR_STATUS
 *   - requestWeight    → weight is pushed automatically every 5 s via CHAR_WEIGHT
 *   - sendCommand      → replaced by per-characteristic functions
 *
 * Added in new version:
 *   - motorFwd         → set direction forward
 *   - motorRev         → set direction reverse
 *   - runTimed         → run motor for N seconds then auto-stop
 *   - setServo         → set scraper servo angle (0–180°)
 *   - weightPct        → bin fill level 0–100
 *   - motorDir         → current direction 'FWD' | 'REV'
 *   - motorSpeed       → current speed 0–255
 *   - rtcTime          → device clock string "YYYY-MM-DD HH:mm:ss"
 */
export function useBleCommands() {
  const {
    bleReady,
    isScanning,
    isConnected,
    status,
    mode,
    weight,
    weightPct,
    motorDir,
    motorSpeed,
    rtcTime,
    lastEvent,
    binFullAlert,
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
  } = useBle();

  return {
    // State
    bleReady,
    isScanning,
    isConnected,
    status,
    mode,
    weight,
    weightPct,
    motorDir,
    motorSpeed,
    rtcTime,
    lastEvent,
    binFullAlert,

    // Connection
    scanAndConnect,
    disconnect,

    // Motor
    startConveyor,
    stopConveyor,
    motorFwd,
    motorRev,
    runTimed,

    // Servo
    setServo,

    // Clock
    setDeviceTime,
    syncDeviceTimeNow,
  };
}