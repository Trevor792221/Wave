plugins { id("com.android.application") }

android {
    namespace = "com.wave.tv"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.wave.tv"
        minSdk = 23
        targetSdk = 35
        versionCode = 10
        versionName = "0.9.1"
    }
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

// Name APKs after the version, e.g. wave-0.9.1.apk (debug builds get a -debug suffix).
android.applicationVariants.all {
    val variant = this
    outputs.all {
        val suffix = if (variant.buildType.name == "release") "" else "-${variant.buildType.name}"
        (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
            "wave-${variant.versionName}$suffix.apk"
    }
}
