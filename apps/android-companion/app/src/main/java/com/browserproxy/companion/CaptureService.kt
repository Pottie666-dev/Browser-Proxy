package com.browserproxy.companion
import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.*
class CaptureService: Service() {
 private val heartbeat=java.util.concurrent.Executors.newSingleThreadScheduledExecutor()
 private var display:android.hardware.display.VirtualDisplay?=null
 private var reader:android.media.ImageReader?=null
 private var projection:MediaProjection?=null
 override fun onBind(intent:Intent?)=null
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
 if(intent?.action=="stop"){stopSelf();return START_NOT_STICKY}
 val data=if(Build.VERSION.SDK_INT>=33)intent?.getParcelableExtra("consent",Intent::class.java) else @Suppress("DEPRECATION") intent?.getParcelableExtra<Intent>("consent")
 if(projection!=null)return START_NOT_STICKY
 if(data==null){stopSelf();return START_NOT_STICKY}
 val manager=getSystemService(NotificationManager::class.java);manager.createNotificationChannel(NotificationChannel("capture","Active screen access",NotificationManager.IMPORTANCE_LOW))
 val stop=PendingIntent.getService(this,1,Intent(this,CaptureService::class.java).setAction("stop"),PendingIntent.FLAG_IMMUTABLE)
 val notification=Notification.Builder(this,"capture").setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("Browser-Proxy screen capture authorized").setContentText("Stage 4: no remote viewer connected").setOngoing(true).addAction(Notification.Action.Builder(null,"Stop",stop).build()).build()
 if(Build.VERSION.SDK_INT>=29)startForeground(1,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(1,notification)
 projection=getSystemService(MediaProjectionManager::class.java).getMediaProjection(Activity.RESULT_OK,data)
 projection?.registerCallback(object:MediaProjection.Callback(){override fun onStop(){stopSelf()}},Handler(mainLooper));active=true
 val metrics=resources.displayMetrics
 reader=android.media.ImageReader.newInstance(metrics.widthPixels,metrics.heightPixels,android.graphics.PixelFormat.RGBA_8888,2)
 reader?.setOnImageAvailableListener({it.acquireLatestImage()?.close()},Handler(mainLooper))
 display=projection?.createVirtualDisplay("BrowserProxyCapture",metrics.widthPixels,metrics.heightPixels,metrics.densityDpi,android.hardware.display.DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,reader?.surface,null,Handler(mainLooper))
 heartbeat.scheduleWithFixedDelay({try{Heartbeat.send(this);if(TokenVault(this).read()==null)stopSelf()}catch(_:Exception){ /* retry without storing or logging credentials */ }},0,30,java.util.concurrent.TimeUnit.SECONDS)
 return START_NOT_STICKY
 }
 override fun onDestroy(){active=false;heartbeat.shutdownNow();display?.release();reader?.close();projection?.stop();projection=null;super.onDestroy()}
 companion object {@Volatile var active=false}
}
