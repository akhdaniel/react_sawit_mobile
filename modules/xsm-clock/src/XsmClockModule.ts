import { NativeModule, requireNativeModule } from 'expo';

declare class XsmClockModule extends NativeModule<Record<string, never>> {
  /** Milidetik sejak boot (Android SystemClock.elapsedRealtime). */
  elapsedRealtime(): number;
  /** Jumlah boot perangkat (Settings.Global.BOOT_COUNT); -1 bila tidak tersedia. */
  bootCount(): number;
}

export default requireNativeModule<XsmClockModule>('XsmClock');
