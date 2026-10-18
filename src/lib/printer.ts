/**
 * Printer thermal Bluetooth LE (ESC/POS). Memilih karakteristik yang bisa ditulis,
 * menegosiasikan MTU, lalu mengirim data dalam potongan.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, type Device } from 'react-native-ble-plx';

import { bytesToBase64 } from './base64';
import { chunk } from './escpos';
import { pickWritable } from './printer-select';

export interface PrinterInfo {
  id: string;
  name: string;
}

let manager: BleManager | null = null;
const ble = () => (manager ??= new BleManager());

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const perms =
    Number(Platform.Version) >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(perms);
  return perms.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** Cari perangkat BLE bernama selama `ms` milidetik. */
export async function scanPrinters(ms = 6000, onFound?: (p: PrinterInfo) => void): Promise<PrinterInfo[]> {
  if (!(await requestBlePermissions())) throw new Error('Izin Bluetooth ditolak');
  const found = new Map<string, PrinterInfo>();
  await ble().startDeviceScan(null, { allowDuplicates: false }, (error, device: Device | null) => {
    if (error || !device) return;
    const name = device.name ?? device.localName;
    if (name && !found.has(device.id)) {
      const info = { id: device.id, name };
      found.set(device.id, info);
      onFound?.(info);
    }
  });
  await new Promise((r) => setTimeout(r, ms));
  await ble().stopDeviceScan();
  return [...found.values()];
}

export async function printBytes(printerId: string, data: Uint8Array): Promise<void> {
  if (!(await requestBlePermissions())) throw new Error('Izin Bluetooth ditolak');
  const m = ble();
  let device = await m.connectToDevice(printerId, { timeout: 10_000 });
  try {
    device = await m.requestMTUForDevice(printerId, 185).catch(() => device);
    await m.discoverAllServicesAndCharacteristicsForDevice(printerId);
    const services = await m.servicesForDevice(printerId);
    const chars = (await Promise.all(services.map((s) => m.characteristicsForDevice(printerId, s.uuid)))).flat();
    const target = pickWritable(chars);
    if (!target) throw new Error('Printer tidak punya karakteristik tulis');
    const size = Math.max(20, (device.mtu ?? 23) - 3);
    for (const part of chunk(data, size)) {
      const b64 = bytesToBase64(part);
      if (target.withoutResponse) {
        await m.writeCharacteristicWithoutResponseForDevice(printerId, target.serviceUUID, target.characteristicUUID, b64);
        await new Promise((r) => setTimeout(r, 15)); // beri waktu buffer printer
      } else {
        await m.writeCharacteristicWithResponseForDevice(printerId, target.serviceUUID, target.characteristicUUID, b64);
      }
    }
  } finally {
    await m.cancelDeviceConnection(printerId).catch(() => undefined);
  }
}
