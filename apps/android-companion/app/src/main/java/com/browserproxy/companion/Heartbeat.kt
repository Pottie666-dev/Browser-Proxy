package com.browserproxy.companion
import android.content.*
import android.os.*
import android.provider.Settings
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection
object Heartbeat {
 @Synchronized fun send(context:Context) {
 val vault=TokenVault(context);val token=vault.read()?:return
 val origin=context.getSharedPreferences("device",0).getString("origin",null)?:return
 val url=URL(ApiOrigin.validate(origin)+"/api/devices/self/heartbeat");require(url.protocol=="https"&&url.userInfo==null&&url.ref==null&&url.query==null)
 val b=context.registerReceiver(null,IntentFilter(Intent.ACTION_BATTERY_CHANGED));val level=b?.getIntExtra(BatteryManager.EXTRA_LEVEL,-1)?:-1;val scale=b?.getIntExtra(BatteryManager.EXTRA_SCALE,100)?:100
 val accessibility=Settings.Secure.getString(context.contentResolver,Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)?.split(':')?.contains(ComponentName(context,InteractionService::class.java).flattenToString())?:false
 val body=JSONObject().put("batteryPercent",if(level<0||scale<=0)JSONObject.NULL else level*100/scale).put("charging",(b?.getIntExtra(BatteryManager.EXTRA_PLUGGED,0)?:0)!=0).put("temperatureC",if(b?.hasExtra(BatteryManager.EXTRA_TEMPERATURE)==true)b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE,0)/10.0 else JSONObject.NULL).put("androidVersion",Build.VERSION.RELEASE).put("model",Build.MODEL).put("captureActive",CaptureService.active).put("accessibilityEnabled",accessibility)
 val c=url.openConnection() as HttpsURLConnection;c.connectTimeout=10000;c.readTimeout=10000;c.requestMethod="POST";c.doOutput=true;c.instanceFollowRedirects=false;c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Authorization","Bearer $token")
 try { c.outputStream.use{it.write(body.toString().toByteArray())};if(c.responseCode==401){vault.clear();return};require(c.responseCode in 200..299);c.inputStream.close()
 val prefs=context.getSharedPreferences("device",0)
 if(System.currentTimeMillis()>prefs.getLong("rotateAt",0)){
 val rotate=URL(ApiOrigin.validate(origin)+"/api/devices/self/rotate").openConnection() as HttpsURLConnection
 rotate.connectTimeout=10000;rotate.readTimeout=10000;rotate.requestMethod="POST";rotate.doOutput=true;rotate.instanceFollowRedirects=false;rotate.setRequestProperty("Content-Type","application/json");rotate.setRequestProperty("Authorization","Bearer $token")
 try{rotate.outputStream.use{it.write("{}".toByteArray())};if(rotate.responseCode==401){vault.clear();return};require(rotate.responseCode==200);val result=JSONObject(rotate.inputStream.bufferedReader().use{it.readText()});vault.save(result.getString("token"));prefs.edit().putLong("rotateAt",System.currentTimeMillis()+7*86400000L).commit()}finally{rotate.disconnect()}
 }
 }finally{c.disconnect()}
 }
}
