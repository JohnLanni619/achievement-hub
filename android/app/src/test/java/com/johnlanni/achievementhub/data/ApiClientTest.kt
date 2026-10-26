package com.johnlanni.achievementhub.data

import com.johnlanni.achievementhub.auth.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.runTest
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.IOException

class InMemoryTokenStore(initial: String? = null) : TokenStore {
    override val token = MutableStateFlow(initial)
    override val ready: StateFlow<Boolean> = MutableStateFlow(true)
    override suspend fun save(token: String) { this.token.value = token }
    override suspend fun clear() { token.value = null }
}

/** Answers requests in-process, recording them, so no network is involved. */
internal class FakeServer : Interceptor {
    val requests = mutableListOf<Request>()
    var respond: (Request) -> Pair<Int, String> = { 200 to "{}" }

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        requests += request
        val (code, body) = respond(request)
        return Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(code)
            .message("test")
            .body(body.toResponseBody("application/json".toMediaType()))
            .build()
    }
}

class ApiClientTest {
    private val server = FakeServer()
    private val http = OkHttpClient.Builder().addInterceptor(server).build()

    private fun client(token: String? = "session-token") =
        InMemoryTokenStore(token).let { store -> store to ApiClient("https://hub.example.com", http, store) }

    private fun Request.bodyText(): String = Buffer().also { buffer -> body?.writeTo(buffer) }.readUtf8()

    private suspend fun expectApiException(block: suspend () -> Unit): ApiException {
        try {
            block()
        } catch (e: ApiException) {
            return e
        }
        fail("Expected ApiException")
        throw AssertionError()
    }

    @Test
    fun `sends the CSRF header and the bearer token`() = runTest {
        val (_, api) = client()
        server.respond = { 200 to """{"providers":[]}""" }
        api.providers()
        val request = server.requests.single()
        assertEquals("https://hub.example.com/api/providers", request.url.toString())
        assertEquals("achievement-hub", request.header("X-Requested-With"))
        assertEquals("Bearer session-token", request.header("Authorization"))
    }

    @Test
    fun `omits Authorization when signed out`() = runTest {
        val (_, api) = client(token = null)
        server.respond = { 200 to """{"user":null}""" }
        assertNull(api.me())
        assertNull(server.requests.single().header("Authorization"))
    }

    @Test
    fun `connect sends the credentials as JSON with PUT`() = runTest {
        val (_, api) = client()
        server.respond = { 200 to """{"connection":{"id":1,"providerId":"demo","externalId":"p1","displayName":"p1"}}""" }
        val connection = api.connect("demo", mapOf("username" to "p1"))
        val request = server.requests.single()
        assertEquals("PUT", request.method)
        assertEquals("/api/connections/demo", request.url.encodedPath)
        assertEquals("""{"credentials":{"username":"p1"}}""", request.bodyText())
        assertEquals("p1", connection.displayName)
    }

    @Test
    fun `encodes path segments`() = runTest {
        val (_, api) = client()
        server.respond = { 200 to """{"game":{"id":"a b","title":"T"}}""" }
        api.game("demo", "a b")
        assertEquals("/api/connections/demo/games/a%20b", server.requests.single().url.encodedPath)
    }

    @Test
    fun `exchanges a Google ID token for a session token`() = runTest {
        val (_, api) = client(token = null)
        server.respond = {
            200 to """{"token":"new-token","expiresInSeconds":2592000,"user":{"id":1,"email":"a@b.co","displayName":"A"}}"""
        }
        val result = api.exchangeGoogleIdToken("google-id-token")
        val request = server.requests.single()
        assertEquals("POST", request.method)
        assertEquals("/api/auth/google/token", request.url.encodedPath)
        assertEquals("""{"idToken":"google-id-token"}""", request.bodyText())
        assertEquals("new-token", result.token)
    }

    @Test
    fun `an expired session clears the token`() = runTest {
        val (store, api) = client()
        server.respond = { 401 to """{"error":"Sign in required.","code":"unauthenticated"}""" }
        val error = expectApiException { api.providers() }
        assertEquals(401, error.status)
        assertEquals("Sign in required.", error.message)
        assertNull(store.token.value)
    }

    @Test
    fun `other 401s keep the session`() = runTest {
        val (store, api) = client()
        server.respond = { 401 to """{"error":"Google sign-in failed.","code":"invalid_id_token"}""" }
        expectApiException { api.exchangeGoogleIdToken("bad") }
        assertEquals("session-token", store.token.value)
    }

    @Test
    fun `flags rejected provider credentials`() = runTest {
        val (_, api) = client()
        server.respond = { 422 to """{"error":"RetroAchievements rejected the API key.","code":"provider_credentials_rejected"}""" }
        val error = expectApiException { api.profile("retroachievements") }
        assertTrue(error.isCredentialsRejected)
    }

    @Test
    fun `reports network failures`() = runTest {
        val (_, api) = client()
        server.respond = { throw IOException("offline") }
        val error = expectApiException { api.providers() }
        assertEquals(0, error.status)
        assertEquals("network", error.code)
    }

    @Test
    fun `falls back to a generic message for non-JSON errors`() = runTest {
        val (_, api) = client()
        server.respond = { 502 to "<html>Bad gateway</html>" }
        val error = expectApiException { api.providers() }
        assertEquals("Request failed (HTTP 502).", error.message)
    }

    @Test
    fun `accepts empty 204 responses`() = runTest {
        val (_, api) = client()
        server.respond = { 204 to "" }
        api.logout()
        api.disconnect("demo")
        assertEquals(listOf("POST", "DELETE"), server.requests.map { it.method })
    }
}
