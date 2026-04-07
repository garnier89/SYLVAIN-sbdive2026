plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.jetbrains.kotlin.android)
    alias(libs.plugins.google.services)
    alias(libs.plugins.firebase.firebase.crashlytics)
}
android {
    signingConfigs {
        create("signConfig") {
            keyAlias = "sbdrive"
            keyPassword = "123456"
            storeFile = file("sbdrive.jks")
            storePassword = "123456"
        }
    }
    namespace = "com.sbdrivervtc.kiosk"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.sbdrivervtc.kiosk"
        minSdk = 23
        targetSdk = 35
        versionCode = 3
        versionName = "3.1"

        multiDexEnabled = true

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }
    flavorDimensions.add("default")
    productFlavors {
        create("dev") {
        }
        create("prod") {
        }
    }
    buildTypes {
        release {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            buildConfigField("String", "USER_TYPE", "\"Hotel\"")
            buildConfigField("String", "USER_ID_KEY", "\"iUserId\"")
            buildConfigField("boolean", "IS_KIOSK_APP", "true")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("signConfig")
            manifestPlaceholders["crashlyticsCollectionEnabled"] = true
            firebaseCrashlytics {
                mappingFileUploadEnabled = true
                nativeSymbolUploadEnabled = true
                unstrippedNativeLibsDir = "build/intermediates/merged_native_libs/release/out/lib"
            }
        }
        debug {
            isDebuggable = true
            isMinifyEnabled = false
            isShrinkResources = false
            buildConfigField("String", "USER_TYPE", "\"Hotel\"")
            buildConfigField("String", "USER_ID_KEY", "\"iUserId\"")
            buildConfigField("boolean", "IS_KIOSK_APP", "true")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("signConfig")
            manifestPlaceholders["crashlyticsCollectionEnabled"] = false
            firebaseCrashlytics {
                mappingFileUploadEnabled = false
                nativeSymbolUploadEnabled = false
                unstrippedNativeLibsDir = "build/intermediates/merged_native_libs/release/out/lib"
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        dataBinding = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar", "*.aar"))))

    implementation(libs.androidx.core.ktx)
    implementation(libs.kotlin.reflect)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)

    /* Android support libraries */
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.multidex)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    /* Android support libraries */

    /* Google services related libraries */
    implementation(libs.play.services.gcm)
    implementation(libs.play.services.maps)
    implementation(libs.android.maps.utils)
    implementation(libs.play.services.ads)

    // Add the Firebase Crashlytics SDK And Google Analytics.
    implementation(libs.firebase.messaging)
    implementation(libs.firebase.crashlytics)
    implementation(libs.firebase.analytics)
    /* Google services related libraries */

    /* AAR File Library */
    implementation(libs.nineoldandroids.library)
    implementation(libs.nv.websocket.client)
    /* AAR File Library */

    /* RetroFit related libraries*/
    implementation(libs.okhttp)
    implementation(libs.okio)
    implementation(libs.retrofit)
    implementation(libs.converter.gson)
    /* RetroFit related libraries*/

    implementation(libs.audience.network.sdk)
    implementation(libs.ripplebackground.library)
    implementation(libs.shimmer.library)

    implementation(libs.picasso)
    implementation(libs.glide)
    implementation(libs.sdp.android)
    implementation(libs.ssp.android)
}