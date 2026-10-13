package com.browserproxy.companion
import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
class PresenceService:Service(){
 private val executor=java.util.concurrent.Executors.newSingleThreadScheduledExecutor()
 override fun onBind(intent:Intent?)=null
 private fun notification(text:String):Notification {
 val stop=PendingIntent.getService(this,3,Intent(this,PresenceService::class.java).setAction("stop"),PendingIntent.FLAG_IMMUTABLE)
 return Notification.Builder(this,"presence").setSmallIcon(android.R.drawable.ic_menu_info_details).setContentTitle("Browser-Proxy Companion connected service").setContentText(text).setOngoing(true).addAction(Notification.Action.Builder(null,"Disconnect",stop).build()).build()
 }
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
 if(intent?.action=="stop"){stopSelf();return START_NOT_STICKY}
 if(running)return START_NOT_STICKY
 getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("presence","Companion connection",NotificationManager.IMPORTANCE_LOW))
 if(Build.VERSION.SDK_INT>=34)startForeground(2,notification("Connecting · remote control unavailable"),ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(2,notification("Connecting · remote control unavailable"))
 running=true
 executor.scheduleWithFixedDelay({try{Heartbeat.send(this);if(TokenVault(this).read()==null){stopSelf();return@scheduleWithFixedDelay};getSystemService(NotificationManager::class.java).notify(2,notification("Registered · screen access requires separate consent"))}catch(_:Exception){getSystemService(NotificationManager::class.java).notify(2,notification("Connection lost · retrying securely"))}},0,30,java.util.concurrent.TimeUnit.SECONDS)
 return START_NOT_STICKY
 }
 override fun onDestroy(){running=false;executor.shutdownNow();super.onDestroy()}
 companion object {@Volatile private var running=false}
}
