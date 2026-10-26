package com.johnlanni.achievementhub

import android.app.Application
import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import com.johnlanni.achievementhub.auth.GoogleSignIn
import com.johnlanni.achievementhub.auth.KeystoreCipher
import com.johnlanni.achievementhub.auth.SessionStore
import com.johnlanni.achievementhub.auth.TokenStore
import com.johnlanni.achievementhub.data.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

private val Context.sessionDataStore by preferencesDataStore(name = "session")

/**
 * App-wide dependencies, created lazily so nothing (e.g. the Keystore) is
 * touched until it's first needed. Tests build screens without it.
 */
class AppContainer(private val context: Context) {
    val config: ApiConfig = ApiConfig.fromBuildConfig()

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    val session: TokenStore by lazy { SessionStore(context.sessionDataStore, KeystoreCipher(), appScope) }

    val api: ApiClient by lazy {
        // Only used when config.isConfigured; the placeholder never gets a request.
        ApiClient(config.baseUrl ?: "https://invalid.invalid", httpClient, session)
    }

    val googleSignIn: GoogleSignIn by lazy { GoogleSignIn(config.googleWebClientId.orEmpty()) }
}

class AchievementHubApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }
}
