package com.browserproxy.companion

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.*

/** Owns one consented projection; ICE restarts replace peers, never reuse a consent Intent. */
class RemoteStream(private val context:Context, consent:Intent, callback:MediaProjection.Callback) {
 private val main=Handler(Looper.getMainLooper())
 private val egl=EglBase.create()
 private val factory:PeerConnectionFactory
 private val source:VideoSource
 private val track:VideoTrack
 private val capturer=ScreenCapturerAndroid(consent,callback)
 private val helper=SurfaceTextureHelper.create("CompanionCapture",egl.eglBaseContext)
 private var peer:PeerConnection?=null
 private var epoch=0
 private var offer=""
 private var local:JSONObject?=null
 private val candidates=JSONArray()
 private var remoteCount=0
 private var ready=false
 private var negotiating=false
 private var publish:((JSONObject)->Unit)?=null
 private var closed=false
 private var incarnation=0
 init {
  PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).setEnableInternalTracer(false).createInitializationOptions())
  Logging.enableLogToDebugOutput(Logging.Severity.LS_NONE)
  factory=PeerConnectionFactory.builder().setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext,true,true)).setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext)).createPeerConnectionFactory()
  source=factory.createVideoSource(true)
  capturer.initialize(helper,context,source.capturerObserver)
  track=factory.createVideoTrack("screen",source)
  // Initial low-resolution capture starts only after the Android system consent.
  val metrics=context.resources.displayMetrics
  val width=360; val height=((width.toDouble()*metrics.heightPixels/metrics.widthPixels).toInt()/2)*2
  capturer.startCapture(width,height,20)
 }
 private fun observer(success:(SessionDescription?)->Unit)=object:SdpObserver {
  override fun onCreateSuccess(s:SessionDescription?){main.post{success(s)}}
  override fun onSetSuccess(){main.post{success(null)}}
  override fun onCreateFailure(error:String?){main.post{disconnect()}}
  override fun onSetFailure(error:String?){main.post{disconnect()}}
 }
 fun accept(session:JSONObject, send:(JSONObject)->Unit) {
  if(closed)return
  publish=send
  val signal=session.optJSONObject("signal")?:return
  val next=signal.optInt("generation",0)
  if(next<1)return
  val sdp=signal.optString("sdp")
  if(next!=epoch || peer==null) {
   disconnect();epoch=next;offer=sdp;negotiating=true
   val ice=mutableListOf<PeerConnection.IceServer>()
   val servers=session.getJSONArray("iceServers")
   for(i in 0 until servers.length()) {
    val server=servers.getJSONObject(i);val urls=server.getJSONArray("urls")
    val list=(0 until urls.length()).map { urls.getString(it) }
    ice.add(PeerConnection.IceServer.builder(list).setUsername(server.optString("username")).setPassword(server.optString("credential")).createIceServer())
   }
   val config=PeerConnection.RTCConfiguration(ice).apply { sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN }
   val current=next
   val instance=incarnation
   val pc=factory.createPeerConnection(config,object:PeerConnection.Observer {
    override fun onSignalingChange(state:PeerConnection.SignalingState?) {}
    override fun onIceConnectionChange(state:PeerConnection.IceConnectionState?) {}
    override fun onIceConnectionReceivingChange(receiving:Boolean) {}
    override fun onIceGatheringChange(state:PeerConnection.IceGatheringState?) {}
    override fun onIceCandidate(candidate:IceCandidate?) { main.post {
     if(epoch==current && incarnation==instance && candidate!=null && candidates.length()<64){candidates.put(JSONObject().put("candidate",candidate.sdp).put("sdpMid",candidate.sdpMid).put("sdpMLineIndex",candidate.sdpMLineIndex));publishLocal()}
    } }
    override fun onIceCandidatesRemoved(candidates:Array<out IceCandidate>?) {}
    override fun onAddStream(stream:MediaStream?) {}
    override fun onRemoveStream(stream:MediaStream?) {}
    override fun onDataChannel(channel:DataChannel?) { channel?.close() } // Input never bypasses the API authorization boundary.
    override fun onRenegotiationNeeded() {}
   }) ?: return
   peer=pc
   val width=session.getInt("resolution")
   val metrics=android.util.DisplayMetrics()
   @Suppress("DEPRECATION") (context.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager).defaultDisplay.getRealMetrics(metrics)
   capturer.changeCaptureFormat(width,((width.toDouble()*metrics.heightPixels/metrics.widthPixels).toInt()/2)*2,20)
   pc.addTrack(track,listOf("screen"))
   pc.setRemoteDescription(observer {
    if(peer!==pc || epoch!=current)return@observer
    ready=true;negotiating=false
    pc.createAnswer(observer { answer ->
     if(answer==null || peer!==pc || epoch!=current)return@observer
     pc.setLocalDescription(observer {
      if(peer===pc && epoch==current){local=JSONObject().put("generation",current).put("sdp",answer.description);publishLocal()}
     },answer)
    },MediaConstraints())
   },SessionDescription(SessionDescription.Type.OFFER,sdp))
  } else if(sdp!=offer) { disconnect();return }
  if(ready && !negotiating) {
   val list=signal.optJSONArray("candidates")?:JSONArray()
   while(remoteCount<list.length()) {
    val c=list.getJSONObject(remoteCount++)
    peer?.addIceCandidate(IceCandidate(if(c.isNull("sdpMid"))null else c.getString("sdpMid"),c.optInt("sdpMLineIndex",0),c.getString("candidate")))
   }
  }
  publishLocal()
 }
 private fun publishLocal(){val s=local?:return;publish?.invoke(JSONObject(s.toString()).put("candidates",JSONArray(candidates.toString())))}
 fun connected()=peer?.connectionState()==PeerConnection.PeerConnectionState.CONNECTED
 fun disconnect(){incarnation++;epoch=0;ready=false;negotiating=false;local=null;offer="";remoteCount=0;while(candidates.length()>0)candidates.remove(0);peer?.close();peer?.dispose();peer=null}
 fun close(){if(closed)return;closed=true;disconnect();capturer.stopCapture();capturer.dispose();track.dispose();source.dispose();helper.dispose();factory.dispose();egl.release()}
}
