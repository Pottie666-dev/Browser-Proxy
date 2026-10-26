// Isolated receive-only WebRTC document. API authentication stays in native fetch.
export const remoteViewerHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; media-src blob:; connect-src 'none'"><style>html,body{margin:0;width:100%;height:100%;background:#111}video{width:100%;height:100%;object-fit:contain;touch-action:none}</style></head><body><video id="screen" autoplay playsinline muted></video><script>
let pc=null, generation=0, local=null, candidates=[], remoteCount=0, busy=false, lastRestart=0, enabled=false;
const video=document.getElementById('screen');
function bridge(type,data){window.ReactNativeWebView.postMessage(JSON.stringify({type,data}));}
function publish(){if(local)bridge('signal',{generation,sdp:local,candidates});}
async function offer(){if(!pc || busy)return;busy=true;try{generation++;candidates=[];remoteCount=0;local=null;const s=await pc.createOffer({iceRestart:true});await pc.setLocalDescription(s);local=s.sdp;publish();lastRestart=Date.now();}catch(e){bridge('status','Negotiation failed');}finally{busy=false;}}
window.remoteStart=async function(iceServers){
 if(!window.RTCPeerConnection){bridge('status','WebRTC unavailable in this Android WebView');return;}
 pc=new RTCPeerConnection({iceServers});pc.addTransceiver('video',{direction:'recvonly'});
 pc.ontrack=e=>{video.srcObject=new MediaStream([e.track]);};
 pc.onicecandidate=e=>{if(e.candidate && candidates.length<64){candidates.push({candidate:e.candidate.candidate,sdpMid:e.candidate.sdpMid,sdpMLineIndex:e.candidate.sdpMLineIndex});publish();}};
 pc.onconnectionstatechange=()=>{enabled=pc.connectionState==='connected';bridge('status',pc.connectionState);};
 await offer();
};
window.remoteUpdate=async function(state){
 if(!pc || busy)return;
 enabled=pc.connectionState==='connected';
 const signal=state.signal;
 if(signal && signal.generation===generation && signal.sdp){
  if(pc.signalingState==='stable' && pc.remoteDescription && pc.remoteDescription.sdp!==signal.sdp){await offer();return;}
  busy=true;try{
   if(pc.signalingState==='have-local-offer')await pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
   if(pc.remoteDescription)while(remoteCount<(signal.candidates||[]).length)await pc.addIceCandidate(signal.candidates[remoteCount++]);
  }catch(e){bridge('status','Signaling interrupted');}finally{busy=false;}
 }
 if(['failed','disconnected'].includes(pc.connectionState) && Date.now()-lastRestart>5000)await offer();
};
window.remotePause=function(){enabled=false;};
window.remoteStop=function(){enabled=false;if(pc)pc.close();pc=null;video.srcObject=null;};
let start=null;
function point(e){const r=video.getBoundingClientRect(),w=video.videoWidth,h=video.videoHeight;if(!w||!h)return null;const scale=Math.min(r.width/w,r.height/h),left=r.left+(r.width-w*scale)/2,top=r.top+(r.height-h*scale)/2;const x=(e.clientX-left)/(w*scale),y=(e.clientY-top)/(h*scale);return x>=0&&x<=1&&y>=0&&y<=1?{x,y}:null;}
video.onpointerdown=e=>{if(enabled){const p=point(e);if(p){start={...p,time:Date.now()};video.setPointerCapture(e.pointerId);}}};
video.onpointerup=e=>{const p=point(e),s=start;start=null;if(!enabled||!p||!s)return;const distance=Math.hypot(p.x-s.x,p.y-s.y);bridge('command',distance<0.015?{type:'tap',x:p.x,y:p.y}:{type:'swipe',x:s.x,y:s.y,x2:p.x,y2:p.y,duration:Math.min(1000,Math.max(100,Date.now()-s.time))});};
video.onpointercancel=()=>{start=null;};
setInterval(async()=>{if(!pc)return;try{let text=pc.connectionState;const stats=await pc.getStats();stats.forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='video')text+=' · '+(s.framesPerSecond||0)+' fps · '+(s.frameWidth||0)+'×'+(s.frameHeight||0);if(s.type==='candidate-pair'&&s.state==='succeeded')text+=' · RTT '+Math.round((s.currentRoundTripTime||0)*1000)+' ms';});bridge('status',text);}catch(e){}},2000);
bridge('ready',null);
</script></body></html>`;
