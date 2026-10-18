import ExpoModulesCore

/// iOS tidak menjadi target utama; systemUptime tidak menghitung waktu sleep.
public class XsmClockModule: Module {
  public func definition() -> ModuleDefinition {
    Name("XsmClock")

    Function("elapsedRealtime") { () -> Double in
      return ProcessInfo.processInfo.systemUptime * 1000
    }

    Function("bootCount") { () -> Int in
      return -1
    }
  }
}
