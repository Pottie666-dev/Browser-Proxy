plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android { namespace = "com.browserproxy.companion"; compileSdk = 36
 defaultConfig { applicationId = "com.browserproxy.companion"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.1.0" }
 val testKey = System.getenv("BROWSER_PROXY_DEV_KEYSTORE")
 if (testKey != null) {
  signingConfigs { create("hardwareTest") { storeFile = file(testKey); storePassword = "android"; keyAlias = "androiddebugkey"; keyPassword = "android" } }
  buildTypes { getByName("debug") { signingConfig = signingConfigs.getByName("hardwareTest") } }
 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}

dependencies { testImplementation("junit:junit:4.13.2") }
