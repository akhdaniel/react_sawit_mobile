package com.xerpium.sawit.clock

import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Jam monotonic untuk trusted time. elapsedRealtime() terus berjalan selama perangkat
 * hidup (termasuk deep sleep) dan tidak terpengaruh perubahan jam/zona waktu oleh pengguna.
 * Nilainya kembali ke 0 setelah reboot, sehingga bootCount() dipakai untuk mendeteksinya.
 */
class XsmClockModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("XsmClock")

    Function("elapsedRealtime") {
      SystemClock.elapsedRealtime().toDouble()
    }

    Function("bootCount") {
      val resolver = appContext.reactContext?.contentResolver ?: return@Function -1
      try {
        Settings.Global.getInt(resolver, Settings.Global.BOOT_COUNT)
      } catch (e: Settings.SettingNotFoundException) {
        -1
      }
    }
  }
}
