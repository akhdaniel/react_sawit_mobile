import { NativeModule, registerWebModule } from 'expo';

class XsmClockModule extends NativeModule<Record<string, never>> {
  elapsedRealtime(): number {
    return performance.now();
  }
  bootCount(): number {
    return -1;
  }
}

export default registerWebModule(XsmClockModule, 'XsmClock');
