plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Build-time configuration. CI passes these as -P properties (from GitHub repo
// variables and secrets); locally, put them in ~/.gradle/gradle.properties.
// None of the non-signing values are secret.
fun prop(name: String): String? = providers.gradleProperty(name).orNull?.takeIf { it.isNotBlank() }

val apiBaseUrl = prop("apiBaseUrl") ?: ""
val googleWebClientId = prop("googleWebClientId") ?: ""

// Release signing. Every CI build uses the same key so its SHA-1, which is
// registered with Google for sign-in, never changes.
val signingStoreFile = prop("signingStoreFile")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "com.johnlanni.achievementhub"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.johnlanni.achievementhub"
        minSdk = 28
        targetSdk = 36
        versionCode = prop("versionCode")?.toInt() ?: 1
        versionName = prop("versionName") ?: "0.1.0-dev"

        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
    }

    signingConfigs {
        if (signingStoreFile != null) {
            create("release") {
                storeFile = signingStoreFile
                storePassword = prop("signingStorePassword")
                keyAlias = prop("signingKeyAlias")
                keyPassword = prop("signingKeyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Without the release key (e.g. a fork's CI or a fresh checkout),
            // fall back to the debug key so the build still produces an APK.
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    testOptions {
        // Robolectric needs merged resources for Compose UI tests.
        unitTests.isIncludeAndroidResources = true
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    debugImplementation(libs.androidx.compose.ui.tooling)
    // Provides the empty activity that Compose UI tests host content in.
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(platform(libs.androidx.compose.bom))
    testImplementation(libs.androidx.compose.ui.test.junit4)
}
