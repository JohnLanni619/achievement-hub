buildscript {
    dependencies {
        // AGP 9 compiles Kotlin itself ("built-in Kotlin") using whichever Kotlin
        // Gradle plugin is on the classpath. Pin it so it matches the Compose
        // compiler plugin version below.
        classpath(libs.kotlin.gradle.plugin)
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
}
