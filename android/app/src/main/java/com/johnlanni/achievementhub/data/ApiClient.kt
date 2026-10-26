package com.johnlanni.achievementhub.data

import com.johnlanni.achievementhub.auth.TokenStore
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * A failed API call. [code] is the server's machine-readable error code
 * (e.g. "unauthenticated", "provider_credentials_rejected", "not_connected"),
 * or "network" when the server couldn't be reached.
 */
class ApiException(val status: Int, val code: String?, override val message: String) : Exception(message) {
    val isCredentialsRejected: Boolean get() = code == "provider_credentials_rejected"
    val isNotConnected: Boolean get() = code == "not_connected"
}

/** Talks to the Achievement Hub Worker API, the same endpoints web/src/api.ts uses. */
class ApiClient(
    baseUrl: String,
    private val http: OkHttpClient,
    private val session: TokenStore,
    private val json: Json = AppJson,
) {
    private val base: HttpUrl = baseUrl.toHttpUrl()

    suspend fun exchangeGoogleIdToken(idToken: String): TokenResponse =
        decode(send("POST", listOf("auth", "google", "token"), buildJsonObject { put("idToken", idToken) }))

    suspend fun me(): User? = decode<MeResponse>(send("GET", listOf("auth", "me"))).user

    suspend fun logout() {
        send("POST", listOf("auth", "logout"))
    }

    suspend fun providers(): List<ProviderWithConnection> =
        decode<ProvidersResponse>(send("GET", listOf("providers"))).providers

    suspend fun connect(providerId: String, credentials: Map<String, String>): Connection {
        val body = buildJsonObject {
            putJsonObject("credentials") { credentials.forEach { (name, value) -> put(name, value) } }
        }
        return decode<ConnectResponse>(send("PUT", listOf("connections", providerId), body)).connection
    }

    suspend fun disconnect(providerId: String) {
        send("DELETE", listOf("connections", providerId))
    }

    suspend fun refresh(providerId: String) {
        send("POST", listOf("connections", providerId, "refresh"))
    }

    suspend fun profile(providerId: String): ProfileResponse =
        decode(send("GET", listOf("connections", providerId, "profile")))

    suspend fun games(providerId: String): List<GameSummary> =
        decode<GamesResponse>(send("GET", listOf("connections", providerId, "games"))).games

    suspend fun game(providerId: String, gameId: String): GameDetail =
        decode<GameResponse>(send("GET", listOf("connections", providerId, "games", gameId))).game

    suspend fun recent(providerId: String): List<RecentAchievement> =
        decode<RecentResponse>(send("GET", listOf("connections", providerId, "recent"))).achievements

    private inline fun <reified T> decode(body: String): T = json.decodeFromString(body)

    /** Sends a request under /api and returns the response body, or throws [ApiException]. */
    private suspend fun send(method: String, path: List<String>, body: JsonElement? = null): String {
        val url = base.newBuilder().addPathSegment("api").apply { path.forEach { addPathSegment(it) } }.build()
        val requestBody = when {
            body != null -> json.encodeToString(JsonElement.serializer(), body).toRequestBody(JSON)
            method == "POST" || method == "PUT" -> ByteArray(0).toRequestBody(null)
            else -> null
        }
        val request = Request.Builder()
            .url(url)
            .method(method, requestBody)
            // Required by the Worker's CSRF check on every mutating request.
            .header("X-Requested-With", "achievement-hub")
            .header("Accept", "application/json")
            .apply { session.token.value?.let { header("Authorization", "Bearer $it") } }
            .build()

        val (status, text) = try {
            http.newCall(request).await()
        } catch (e: IOException) {
            throw ApiException(0, "network", "Couldn't reach Achievement Hub. Check your connection and try again.")
        }
        if (status in 200..299) return text

        val error = runCatching { json.decodeFromString<ErrorBody>(text) }.getOrNull()
        if (status == 401 && error?.code == "unauthenticated") {
            // Our session ended (expired or signed out elsewhere): drop to the sign-in screen.
            session.clear()
        }
        throw ApiException(status, error?.code, error?.error ?: "Request failed (HTTP $status).")
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}

/** Runs the call without blocking, resuming with (status, body text). Cancelling cancels the call. */
private suspend fun Call.await(): Pair<Int, String> = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            continuation.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            val result = try {
                response.use { it.code to it.body.string() }
            } catch (e: IOException) {
                continuation.resumeWithException(e)
                return
            }
            continuation.resume(result)
        }
    })
}
