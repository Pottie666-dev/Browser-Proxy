package com.browserproxy.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

class TokenVault(private val context: Context): CredentialStore {
    private val prefs = context.getSharedPreferences("credentials", Context.MODE_PRIVATE)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias("device-token")) return store.getKey("device-token", null) as SecretKey
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("device-token", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun decode(value: String): String {
        val bytes = Base64.decode(value, Base64.NO_WRAP)
        require(bytes.size >= 28)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), javax.crypto.spec.GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)))
    }
    override fun load(): DeviceCredentials? {
        val bundle = prefs.getString("bundle", null)
        val value = try {
            if (bundle != null) {
                val data = JSONObject(decode(bundle))
                DeviceCredentials(data.getString("token"), ApiOrigin.validate(data.getString("origin")), data.getLong("rotateAt"))
            } else {
                val legacy = prefs.getString("token", null) ?: return null
                val previous = context.getSharedPreferences("device", Context.MODE_PRIVATE)
                DeviceCredentials(decode(legacy), ApiOrigin.validate(previous.getString("origin", "")!!), previous.getLong("rotateAt", 0))
            }
        } catch (_: Exception) {
            clear() // Corrupted/unrecoverable data is refused. Never authenticate with plaintext fallback.
            return null
        }
        // A failed migration write must preserve the valid legacy record for recovery.
        if (bundle == null) save(value)
        return value
    }
    override fun save(value: DeviceCredentials) {
        val data = JSONObject().put("token", value.token).put("origin", ApiOrigin.validate(value.origin)).put("rotateAt", value.rotateAt)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = Base64.encodeToString(cipher.iv + cipher.doFinal(data.toString().toByteArray()), Base64.NO_WRAP)
        check(prefs.edit().putString("bundle", encrypted).remove("token").commit()) { "Credential persistence failed" }
    }
    override fun clear() { check(prefs.edit().clear().commit()) { "Credential clearing failed" } }
}
object CredentialManager {
    private var coordinator: CredentialCoordinator? = null
    @Synchronized fun get(context: Context): CredentialCoordinator {
        return coordinator ?: CredentialCoordinator(TokenVault(context.applicationContext)).also { coordinator = it }
    }
}
