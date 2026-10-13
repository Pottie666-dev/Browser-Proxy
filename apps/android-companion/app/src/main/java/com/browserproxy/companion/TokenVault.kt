package com.browserproxy.companion
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
class TokenVault(private val context: Context) {
 private fun key(): SecretKey { val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)}; if(store.containsAlias("device-token"))return store.getKey("device-token",null) as SecretKey
 return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore").apply { init(KeyGenParameterSpec.Builder("device-token",KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build()) }.generateKey() }
 fun save(token:String) { val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());context.getSharedPreferences("credentials",0).edit().putString("token",Base64.encodeToString(c.iv+c.doFinal(token.toByteArray()),Base64.NO_WRAP)).commit() }
 fun read():String? { val v=context.getSharedPreferences("credentials",0).getString("token",null)?:return null;val bytes=Base64.decode(v,Base64.NO_WRAP);val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),javax.crypto.spec.GCMParameterSpec(128,bytes.copyOfRange(0,12)));return String(c.doFinal(bytes.copyOfRange(12,bytes.size))) }
 fun clear(){context.getSharedPreferences("credentials",0).edit().clear().commit()}
}
