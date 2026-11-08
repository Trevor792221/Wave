plugins { id("com.android.application") }

android {
    namespace = "com.wave.tv"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.wave.tv"
        minSdk = 23
        targetSdk = 35
        versionCode = 9
        versionName = "0.9"
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            // Test build: sign release with the debug key so it installs directly.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
// No dependencies: plain Android framework only.

// Name APKs after the version, e.g. wave-0.8-test.apk (debug builds get a -debug suffix).
android.applicationVariants.all {
    val variant = this
    outputs.all {
        val suffix = if (variant.buildType.name == "release") "" else "-${variant.buildType.name}"
        (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
            "wave-${variant.versionName}$suffix.apk"
    }
}
