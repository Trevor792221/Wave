plugins { id("com.android.application") }

android {
    namespace = "com.wave.tv"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.wave.tv"
        minSdk = 23
        targetSdk = 35
    }
    // Two apps from one codebase: Wave (TV, com.wave.tv) and Wave Mobile (phones and Android
    // Auto, com.wave.mobile). BuildConfig.TV tells the shared code which one it is. Each has its
    // own version: TV releases are tagged v<version>, Wave Mobile's mobile-v<version>.
    flavorDimensions += "device"
    productFlavors {
        create("tv") {
            dimension = "device"
            applicationId = "com.wave.tv"
            versionCode = 43
            versionName = "2.0.4"
            buildConfigField("boolean", "TV", "true")
        }
        create("mobile") {
            dimension = "device"
            applicationId = "com.wave.mobile"
            versionCode = 107
            versionName = "1.0.7"
            buildConfigField("boolean", "TV", "false")
        }
    }
    buildFeatures { buildConfig = true }
    // Release signing comes from environment variables (set by the release workflow from repo
    // secrets). Without them, release builds fall back to the local debug key.
    val releaseKeystore = System.getenv("WAVE_KEYSTORE_FILE")
    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("WAVE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("WAVE_KEY_ALIAS")
                keyPassword = System.getenv("WAVE_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName(if (releaseKeystore != null) "release" else "debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
// No dependencies: plain Android framework only.

// Name APKs after the app and version: wave-2.0.3.apk (TV), wave-mobile-2.0.3.apk (phone).
// Debug builds get a -debug suffix.
android.applicationVariants.all {
    val variant = this
    outputs.all {
        val app = if (variant.flavorName == "mobile") "wave-mobile" else "wave"
        val suffix = if (variant.buildType.name == "release") "" else "-${variant.buildType.name}"
        (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
            "$app-${variant.versionName}$suffix.apk"
    }
}
