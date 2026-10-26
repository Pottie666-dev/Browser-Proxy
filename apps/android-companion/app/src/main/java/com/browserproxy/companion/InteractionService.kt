package com.browserproxy.companion

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject

/** No exported command receiver. Only the authenticated capture worker can invoke input. */
class InteractionService : AccessibilityService() {
 override fun onServiceConnected() { instance = this }
 override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
 override fun onInterrupt() { instance = null; stopService(android.content.Intent(this, CaptureService::class.java)) }
 override fun onDestroy() { instance = null; super.onDestroy() }
 fun execute(command: JSONObject) {
  if (!CaptureService.active) return
  when(command.optString("type")) {
   "navigation" -> when(command.optString("action")) {
    "back" -> performGlobalAction(GLOBAL_ACTION_BACK)
    "home" -> performGlobalAction(GLOBAL_ACTION_HOME)
    "recents" -> performGlobalAction(GLOBAL_ACTION_RECENTS)
   }
   "text" -> {
    val text = command.optString("text")
    if(text.isEmpty() || text.length > 500) return
    val node = rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return
    try {
     // Never fill password fields, inspect their content, or traverse unrelated nodes.
     if(node.isEditable && !node.isPassword) node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text) })
    } finally { @Suppress("DEPRECATION") node.recycle() }
   }
   "tap", "swipe" -> {
    val x=command.optDouble("x",Double.NaN); val y=command.optDouble("y",Double.NaN)
    val swipe=command.optString("type")=="swipe"
    val x2=if(swipe) command.optDouble("x2",Double.NaN) else x
    val y2=if(swipe) command.optDouble("y2",Double.NaN) else y
    if(listOf(x,y,x2,y2).any { !it.isFinite() || it !in 0.0..1.0 }) return
    val metrics=android.util.DisplayMetrics()
    @Suppress("DEPRECATION") (getSystemService(WINDOW_SERVICE) as android.view.WindowManager).defaultDisplay.getRealMetrics(metrics)
    val path=Path().apply { moveTo((x*(metrics.widthPixels-1)).toFloat(),(y*(metrics.heightPixels-1)).toFloat()); if(swipe) lineTo((x2*(metrics.widthPixels-1)).toFloat(),(y2*(metrics.heightPixels-1)).toFloat()) }
    val duration=if(swipe) command.optLong("duration",300).coerceIn(100,1000) else 60L
    dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path,0,duration)).build(),null,null)
   }
  }
 }
 companion object { @Volatile var instance: InteractionService? = null; private set }
}
