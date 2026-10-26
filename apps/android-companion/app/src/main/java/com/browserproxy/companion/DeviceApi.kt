package com.browserproxy.companion

import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection

class DeviceRejected: Exception("Device credentials expired or revoked; pair again")
object DeviceApi {
    fun post(origin: String, path: String, body: JSONObject, token: String? = null, namespace: String = "devices"): JSONObject {
        val connection = URL(ApiOrigin.validate(origin) + "/api/" + namespace + path).openConnection() as HttpsURLConnection
        connection.connectTimeout = 10000
        connection.readTimeout = 10000
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.instanceFollowRedirects = false
        connection.setRequestProperty("Content-Type", "application/json")
        if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
        try {
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
            if (connection.responseCode == 401) throw DeviceRejected()
            check(connection.responseCode in 200..299) { "API rejected request (${connection.responseCode})" }
            return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        } finally { connection.disconnect() }
    }
}
