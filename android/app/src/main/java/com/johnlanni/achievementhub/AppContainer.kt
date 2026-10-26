package com.johnlanni.achievementhub

import android.app.Application
import android.content.Context
import androidx.datastore.preferences.preferencesDataStore
import com.johnlanni.achievementhub.auth.GoogleSignIn
import com.johnlanni.achievementhub.auth.KeystoreCipher
import com.johnlanni.achievementhub.auth.SessionStore
import com.johnlanni.achievementhub.auth.TokenStore
import com.johnlanni.achievementhub.data.AchievementRepository
import com.johnlanni.achievementhub.data.ApiClient
import com.johnlanni.achievementhub.data.cache.CacheDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
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

    /** The API through the offline cache. Screens read from this rather than [api]. */
    val repository: AchievementRepository by lazy {
        AchievementRepository(api, CacheDatabase.create(context).cache()).also { repository ->
            // Signing out, or the session expiring (a 401 clears it), drops the cached data.
            appScope.launch {
                combine(session.ready, session.token) { ready, token -> ready && token == null }
                    .distinctUntilChanged()
                    .filter { it }
                    .collect { repository.clear() }
            }
        }
    }

    val googleSignIn: GoogleSignIn by lazy { GoogleSignIn(config.googleWebClientId.orEmpty()) }
}

class AchievementHubApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }
}
