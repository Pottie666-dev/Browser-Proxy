package com.browserproxy.companion
import android.app.*
import android.content.*
import android.media.projection.MediaProjectionManager
import android.os.*
import android.provider.Settings
import android.widget.*
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import java.util.concurrent.Executors
class MainActivity:Activity() {
 @Volatile private var apiOrigin=""
 private val executor=Executors.newSingleThreadScheduledExecutor();private lateinit var vault:TokenVault;private lateinit var origin:EditText;private lateinit var status:TextView
 private fun request(path:String,body:JSONObject,token:String?=null,baseOverride:String?=null):JSONObject {
 val base=ApiOrigin.validate(baseOverride?:apiOrigin);val url=URL(base);require(url.protocol=="https" && url.userInfo==null && url.query==null && url.ref==null){"Use an HTTPS API origin"}
 val c=URL(base+"/api/devices"+path).openConnection() as HttpsURLConnection;c.connectTimeout=10000;c.readTimeout=10000;c.requestMethod="POST";c.doOutput=true;c.setRequestProperty("Content-Type","application/json");if(token!=null)c.setRequestProperty("Authorization","Bearer $token");c.instanceFollowRedirects=false
 try{c.outputStream.use{it.write(body.toString().toByteArray())};if(c.responseCode==401){vault.clear();throw IllegalStateException("Credentials expired or revoked: pair again")};require(c.responseCode in 200..299){"API rejected request (${c.responseCode})"};return JSONObject(c.inputStream.bufferedReader().use{it.readText()})}finally{c.disconnect()}
 }
 private fun work(action:()->Unit){executor.execute{try{action()}catch(e:Exception){runOnUiThread{status.text=e.message?:"Connection unavailable; retrying"}}}}
 override fun onCreate(saved:Bundle?){super.onCreate(saved);vault=TokenVault(this);val prefs=getSharedPreferences("device",0);val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(30,30,30,30)};setContentView(layout)
 origin=EditText(this).apply{hint="HTTPS API origin";setText(prefs.getString("origin",""));apiOrigin=text.toString()};layout.addView(origin);val code=EditText(this).apply{hint="Single-use pairing code"};layout.addView(code);status=TextView(this);layout.addView(status)
 fun button(text:String,action:()->Unit){layout.addView(Button(this).apply{this.text=text;setOnClickListener{action()}})}
 button("Pair this phone"){val base=origin.text.toString();val pairing=code.text.toString().trim();work{synchronized(Heartbeat){require(vault.read()==null){"Forget existing credentials before pairing another device"};val result=request("/register",JSONObject().put("code",pairing).put("name",Build.MODEL),baseOverride=base);vault.save(result.getString("token"));apiOrigin=ApiOrigin.validate(base);prefs.edit().putString("origin",base).putLong("rotateAt",System.currentTimeMillis()+7*86400000L).commit();runOnUiThread{code.setText("");status.text="Registered. Heartbeats run while this screen is open."}}}}
 button("Start persistent connection"){if(Build.VERSION.SDK_INT>=33)requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),3);startForegroundService(Intent(this,PresenceService::class.java))}
 button("Disconnect background service"){stopService(Intent(this,PresenceService::class.java))}
 button("Authorize screen capture"){if(Build.VERSION.SDK_INT>=33)requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),3);startActivityForResult(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(),2)}
 button("Stop screen capture"){stopService(Intent(this,CaptureService::class.java))}
 button("Accessibility settings (optional)"){startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))}
 button("Forget credentials"){stopService(Intent(this,PresenceService::class.java));stopService(Intent(this,CaptureService::class.java));vault.clear();status.text="Forgotten locally. Revoke the device in Device Hub too."}
 executor.scheduleWithFixedDelay({work{if(vault.read()==null){runOnUiThread{status.text="Not paired"};return@work};Heartbeat.send(this);runOnUiThread{status.text="Device status sent · capture ${if(CaptureService.active) "active" else "off"}"}}},2,30,java.util.concurrent.TimeUnit.SECONDS)
 }
 @Deprecated("Android activity result compatibility") override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){super.onActivityResult(requestCode,resultCode,data);if(requestCode==2&&resultCode==RESULT_OK&&data!=null)startForegroundService(Intent(this,CaptureService::class.java).putExtra("consent",data))}
 override fun onDestroy(){executor.shutdownNow();super.onDestroy()}
}
