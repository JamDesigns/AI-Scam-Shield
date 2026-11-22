import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

// Debug builds must work without accessing the private release signing file.
val releaseSigningRequested = gradle.startParameter.taskNames.any {
    val task = it.substringAfterLast(':').lowercase()
    task.contains("release") || task in setOf("build", "assemble", "bundle")
}
val keystoreProperties = Properties()
if (releaseSigningRequested) {
    val signingFile = rootProject.file("key.properties")
    require(signingFile.isFile) { "Release signing requires android/key.properties." }
    signingFile.inputStream().use { keystoreProperties.load(it) }
    for (key in listOf("keyAlias", "keyPassword", "storeFile", "storePassword")) {
        require(!keystoreProperties.getProperty(key).isNullOrBlank()) {
            "Missing release signing property: $key"
        }
    }
}

android {
    namespace = "com.jamdesigns.scamshield"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    signingConfigs {
        create("release") {
            if (releaseSigningRequested) {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }

    defaultConfig {
        applicationId = "com.jamdesigns.scamshield"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

tasks.configureEach {
    if (name == "validateSigningRelease") {
        doFirst {
            check(releaseSigningRequested) {
                "Request a release task explicitly to load private release signing."
            }
        }
    }
}

flutter {
    source = "../.."
}
