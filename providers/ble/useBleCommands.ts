import {useBle} from './useBle';

export function useBleCommands() {
  const {
    bleReady,
    isScanning,
    isConnected,
    status,
    mode,
    weight,
    lastEvent,
    binFullAlert,
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
  } = useBle();

  return {
    bleReady,
    isScanning,
    isConnected,
    status,
    mode,
    weight,
    lastEvent,
    binFullAlert,
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
  };
}