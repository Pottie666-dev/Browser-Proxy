package com.browserproxy.companion

import android.content.*
import android.os.*
import android.provider.Settings
import org.json.JSONObject

enum class HeartbeatResult { CONNECTED, UNPAIRED, REVOKED, STALE }
object Heartbeat {
    @Synchronized fun send(context: Context): HeartbeatResult {
        val coordinator = CredentialManager.get(context)
        val snapshot = coordinator.snapshot()
        val credential = snapshot.credentials ?: return HeartbeatResult.UNPAIRED
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?.split(':')?.contains(ComponentName(context, InteractionService::class.java).flattenToString()) ?: false
        val status = JSONObject()
            .put("batteryPercent", if (level < 0 || scale <= 0) JSONObject.NULL else level * 100 / scale)
            .put("charging", (battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0)
            .put("temperatureC", if (battery?.hasExtra(BatteryManager.EXTRA_TEMPERATURE) == true) battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0 else JSONObject.NULL)
            .put("androidVersion", Build.VERSION.RELEASE).put("model", Build.MODEL)
            .put("captureActive", CaptureService.active).put("accessibilityEnabled", enabled)
        try {
            DeviceApi.post(credential.origin, "/self/heartbeat", status, credential.token)
            if (coordinator.snapshot().generation != snapshot.generation) return HeartbeatResult.STALE
            if (System.currentTimeMillis() > credential.rotateAt && coordinator.beginRotation(snapshot)) {
                try {
                    val result = DeviceApi.post(credential.origin, "/self/rotate", JSONObject(), credential.token)
                    if (!coordinator.acceptRotation(snapshot, result.getString("token"), System.currentTimeMillis() + 7 * 86400000L)) return HeartbeatResult.STALE
                } finally { coordinator.finishRotation(snapshot) }
            }
            return if (coordinator.snapshot().credentials == null) HeartbeatResult.STALE else HeartbeatResult.CONNECTED
        } catch (_: DeviceRejected) {
            return if (coordinator.invalidate(snapshot)) HeartbeatResult.REVOKED else HeartbeatResult.STALE
        }
    }
}
