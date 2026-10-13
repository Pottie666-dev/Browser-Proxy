package com.browserproxy.companion
import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
class InteractionService : AccessibilityService() {
 override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
 override fun onInterrupt() {}
 // Deliberately no command receiver. Stage 5 must verify a short-lived session before gestures.
}
