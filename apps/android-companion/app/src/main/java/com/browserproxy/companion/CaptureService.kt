package com.browserproxy.companion

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.os.*
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class CaptureService: Service() {
 private val worker=Executors.newSingleThreadScheduledExecutor()
 private val main=Handler(Looper.getMainLooper())
 private var stream:RemoteStream?=null
 @Volatile private var sessionId:String?=null
 @Volatile private var validUntil=0L
 private var sessionExpires=0L
 @Volatile private var generation=0L
 private var lastHeartbeat=0L
 private var captureRotation=0
 @Suppress("DEPRECATION") private fun rotation()=(getSystemService(WINDOW_SERVICE) as android.view.WindowManager).defaultDisplay.rotation
 private val watchdog=object:Runnable {
  override fun run() {
   if(active && rotation()!=captureRotation){stopSelf();return}
   if(sessionId!=null && (SystemClock.elapsedRealtime()>validUntil || System.currentTimeMillis()>sessionExpires || CredentialManager.get(this@CaptureService).snapshot().credentials==null)) disconnect()
   main.postDelayed(this,200)
  }
 }
 override fun onBind(intent:Intent?)=null
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  if(intent?.action=="stop"){stopSelf();return START_NOT_STICKY}
  if(stream!=null)return START_NOT_STICKY
  val data=if(Build.VERSION.SDK_INT>=33)intent?.getParcelableExtra("consent",Intent::class.java) else @Suppress("DEPRECATION") intent?.getParcelableExtra<Intent>("consent")
  if(data==null || CredentialManager.get(this).snapshot().credentials==null){stopSelf();return START_NOT_STICKY}
  val manager=getSystemService(NotificationManager::class.java)
  manager.createNotificationChannel(NotificationChannel("capture","Active screen access",NotificationManager.IMPORTANCE_LOW))
  notifyState("Waiting for an authenticated controller")
  try {
   stream=RemoteStream(this,data,object:MediaProjection.Callback(){override fun onStop(){main.post { stopSelf() }}})
   captureRotation=rotation()
   active=true
   main.post(watchdog)
   worker.scheduleWithFixedDelay({ poll() },0,1,TimeUnit.SECONDS)
  } catch(_:Exception) { stopSelf() }
  return START_NOT_STICKY
 }
 private fun notifyState(text:String) {
  val stop=PendingIntent.getService(this,1,Intent(this,CaptureService::class.java).setAction("stop"),PendingIntent.FLAG_IMMUTABLE)
  val notification=Notification.Builder(this,"capture").setSmallIcon(android.R.drawable.ic_menu_view).setContentTitle("Browser-Proxy screen capture authorized").setContentText(text).setOngoing(true).addAction(Notification.Action.Builder(null,"Stop capture and control",stop).build()).build()
  if(Build.VERSION.SDK_INT>=29)startForeground(1,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) else startForeground(1,notification)
 }
 private fun disconnect() { sessionId=null; validUntil=0; generation++; stream?.disconnect(); notifyState("Disconnected · waiting for controller") }
 private fun poll() {
  val coordinator=CredentialManager.get(this); val snapshot=coordinator.snapshot(); val credential=snapshot.credentials
  if(credential==null){main.post{stopSelf()};return}
  try {
   if(SystemClock.elapsedRealtime()-lastHeartbeat>30000){Heartbeat.send(this);lastHeartbeat=SystemClock.elapsedRealtime()}
   val sent=SystemClock.elapsedRealtime()
   val response=DeviceApi.post(credential.origin,"/self/poll",JSONObject(),credential.token,"remote")
   if(coordinator.snapshot().generation!=snapshot.generation)return
   val session=response.optJSONObject("session")
   main.post {
    if(!active || coordinator.snapshot().generation!=snapshot.generation)return@post
    if(session==null){if(sessionId!=null)disconnect();return@post}
    // Count the network round trip against the authorization lease.
    val until=sent+response.optLong("leaseMs",0).coerceIn(0,4000)
    if(SystemClock.elapsedRealtime()>=until)return@post
    val id=session.getString("id")
    if(sessionId!=id){disconnect();sessionId=id;notifyState("Controller connected · screen sharing")}
    validUntil=until
    sessionExpires=java.time.Instant.parse(session.getString("expiresAt")).toEpochMilli()
    if(System.currentTimeMillis()>=sessionExpires){disconnect();return@post}
    val epoch=generation
    stream?.accept(session) { signal ->
     worker.execute {
      try {
       if(sessionId==id && generation==epoch && SystemClock.elapsedRealtime()<validUntil)
        DeviceApi.post(credential.origin,"/self/$id/signal",signal,credential.token,"remote")
      } catch(_:Exception) { /* Polling retries complete signaling snapshots. */ }
     }
    }
    if(rotation()!=captureRotation){stopSelf();return@post}
    val commands=response.optJSONArray("commands")
    if(stream?.connected()==true && InteractionService.instance!=null) for(i in 0 until (commands?.length()?:0)) {
     val c=commands!!.getJSONObject(i)
     if(SystemClock.elapsedRealtime()<validUntil && System.currentTimeMillis()<c.optLong("deadline",0)) InteractionService.instance?.execute(c)
    }
   }
  } catch(_:DeviceRejected) { coordinator.invalidate(snapshot);main.post{stopSelf()} }
    catch(_:Exception) { /* Main-thread watchdog disconnects if no fresh authorization arrives. */ }
 }
 override fun onDestroy(){active=false;main.removeCallbacksAndMessages(null);worker.shutdownNow();stream?.close();stream=null;super.onDestroy()}
 companion object {@Volatile var active=false}
}
