package com.browserproxy.companion

import android.app.*
import android.content.*
import android.media.projection.MediaProjectionManager
import android.os.*
import android.provider.Settings
import android.widget.*
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class MainActivity: Activity() {
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private lateinit var coordinator: CredentialCoordinator
    private lateinit var status: TextView
    private fun work(action: () -> Unit) {
        executor.execute {
            try { action() } catch (_: Exception) { runOnUiThread { status.text = "Operation failed. Check connection or pair again." } }
        }
    }
    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        coordinator = CredentialManager.get(this)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(30,30,30,30) }
        setContentView(layout)
        val origin = EditText(this).apply { hint = "HTTPS API origin"; setText(coordinator.snapshot().credentials?.origin ?: "") }
        val code = EditText(this).apply { hint = "Single-use pairing code"; inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD }
        status = TextView(this)
        layout.addView(origin); layout.addView(code); layout.addView(status)
        fun button(text: String, action: () -> Unit) { layout.addView(Button(this).apply { this.text = text; setOnClickListener { action() } }) }
        button("Pair this phone") {
            val base = origin.text.toString(); val pairingCode = code.text.toString().trim()
            work {
                val generation = coordinator.beginPairing()
                try {
                    val result = DeviceApi.post(base, "/register", JSONObject().put("code", pairingCode).put("name", Build.MODEL))
                    val accepted = coordinator.acceptPairing(generation, DeviceCredentials(result.getString("token"), ApiOrigin.validate(base), System.currentTimeMillis() + 7 * 86400000L))
                    runOnUiThread { code.setText(""); status.text = if(accepted) "Registered. Start persistent connection for background presence." else "Pairing cancelled locally. Review registered devices in Device Hub." }
                } finally { coordinator.finishPairing(generation) }
            }
        }
        button("Start persistent connection") {
            if (coordinator.snapshot().credentials == null) { status.text = "Pair this phone first"; return@button }
            if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 3)
            startForegroundService(Intent(this, PresenceService::class.java))
        }
        button("Disconnect background service") { stopService(Intent(this, PresenceService::class.java)) }
        button("Authorize screen capture") {
            if (coordinator.snapshot().credentials == null) { status.text = "Pair this phone first"; return@button }
            if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 3)
            startActivityForResult(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(), 2)
        }
        button("Stop screen capture") { stopService(Intent(this, CaptureService::class.java)) }
        button("Accessibility settings (optional)") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        button("Forget credentials") {
            try {
                coordinator.clear()
                stopService(Intent(this, PresenceService::class.java)); stopService(Intent(this, CaptureService::class.java))
                status.text = "Forgotten locally. Revoke the device in Device Hub too."
            } catch (_: Exception) { status.text = "Unable to persist credential clearing. Revoke in Device Hub." }
        }
        executor.scheduleWithFixedDelay({
            try {
                val result = Heartbeat.send(this)
                runOnUiThread {
                    when(result) {
                        HeartbeatResult.CONNECTED -> status.text = "Connected · capture ${if(CaptureService.active) "active" else "off"}"
                        HeartbeatResult.UNPAIRED -> status.text = "Not paired. Expired/revoked credentials require pairing again."
                        HeartbeatResult.REVOKED -> { status.text = "Device credentials revoked or expired. Pair again."; stopService(Intent(this, CaptureService::class.java)); stopService(Intent(this, PresenceService::class.java)) }
                        HeartbeatResult.STALE -> Unit
                    }
                }
            } catch (_: Exception) { runOnUiThread { status.text = "Connection unavailable · retrying securely" } }
        }, 2, 30, TimeUnit.SECONDS)
    }
    @Deprecated("Android activity result compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 2 && resultCode == RESULT_OK && data != null && coordinator.snapshot().credentials != null)
            startForegroundService(Intent(this, CaptureService::class.java).putExtra("consent", data))
    }
    override fun onDestroy() { executor.shutdownNow(); super.onDestroy() }
}
