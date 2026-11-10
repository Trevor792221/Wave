plugins { id("com.android.application") }

// Wave Probe: a bare Tidal web player that logs which kinds of request the page makes and,
// on request, how Tidal's page and player are built (structure only, no personal content).
// Used to work out how Wave should talk to Tidal's page. Signed like Wave: the release key
// from the environment when set (the workflow), else the local debug key.
val releaseKeystore: String? = System.getenv("WAVE_KEYSTORE_FILE")

android {
    namespace = "com.wave.probe"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.wave.probe"
        minSdk = 23
        targetSdk = 35
        versionCode = 9
        versionName = "7"
    }
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
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName(if (releaseKeystore != null) "release" else "debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
// wave-probe-4.1.apk
android.applicationVariants.all {
    val variant = this
    outputs.all {
        val suffix = if (variant.buildType.name == "release") "" else "-${variant.buildType.name}"
        (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
            "wave-probe-${variant.versionName}$suffix.apk"
    }
}
