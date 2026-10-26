plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android { namespace = "com.browserproxy.companion"; compileSdk = 36
 defaultConfig { applicationId = "com.browserproxy.companion"; minSdk = 26; targetSdk = 35; versionCode = 2; versionName = "0.2.0" }
 val testKey = System.getenv("BROWSER_PROXY_DEV_KEYSTORE")
 if (testKey != null) {
  signingConfigs { create("hardwareTest") { storeFile = file(testKey); storePassword = "android"; keyAlias = "androiddebugkey"; keyPassword = "android" } }
  buildTypes { getByName("debug") { signingConfig = signingConfigs.getByName("hardwareTest") } }
 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}

dependencies { implementation("io.github.webrtc-sdk:android:144.7559.15"); testImplementation("junit:junit:4.13.2") }
