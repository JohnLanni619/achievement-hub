package com.johnlanni.achievementhub.data

import androidx.room.Room
import com.johnlanni.achievementhub.data.cache.CacheDatabase
import com.johnlanni.achievementhub.data.cache.CachedResponse
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import java.io.IOException

/** Stale-while-revalidate reads against a real (in-memory) Room database and an in-process fake server. */
@RunWith(RobolectricTestRunner::class)
class AchievementRepositoryTest {
    private val server = FakeServer()
    private val session = InMemoryTokenStore("session-token")
    private val api = ApiClient("https://hub.example.com", OkHttpClient.Builder().addInterceptor(server).build(), session)
    private val db = Room.inMemoryDatabaseBuilder(RuntimeEnvironment.getApplication(), CacheDatabase::class.java)
        .allowMainThreadQueries()
        .build()
    private val dao = db.cache()
    private var clock = 1_000L
    private val repository = AchievementRepository(api, dao, now = { clock })

    private val gamesJson = """{"games":[{"id":"228","title":"Super Mario World","earned":3,"total":10}]}"""

    @After
    fun closeDb() = db.close()

    @Test
    fun `with nothing cached, emits the fresh response and stores it`() = runTest {
        server.respond = { 200 to gamesJson }
        val emitted = repository.games("ra").toList()

        assertEquals(1, emitted.size)
        assertFalse(emitted[0].fromCache)
        assertEquals("Super Mario World", emitted[0].value.single().title)
        val row = dao.get("games/ra")!!
        assertEquals("ra", row.providerId)
        assertEquals(1_000L, row.fetchedAt)
    }

    @Test
    fun `emits the cached copy first, then the fresh one`() = runTest {
        server.respond = { 200 to gamesJson }
        repository.games("ra").toList()

        clock = 5_000L
        server.respond = { 200 to """{"games":[{"id":"228","title":"Super Mario World","earned":4,"total":10}]}""" }
        val emitted = repository.games("ra").toList()

        assertEquals(listOf(true, false), emitted.map { it.fromCache })
        assertEquals(listOf(3, 4), emitted.map { it.value.single().earned })
        assertEquals(listOf(1_000L, 5_000L), emitted.map { it.fetchedAt })
        assertEquals(5_000L, dao.get("games/ra")?.fetchedAt)
    }

    @Test
    fun `offline with a cached copy, re-emits it with the error`() = runTest {
        server.respond = { 200 to gamesJson }
        repository.games("ra").toList()

        server.respond = { throw IOException("offline") }
        val emitted = repository.games("ra").toList()

        assertEquals(2, emitted.size)
        assertNull(emitted[0].refreshError)
        val last = emitted[1]
        assertTrue(last.fromCache)
        assertEquals("network", last.refreshError?.code)
        assertEquals(1_000L, last.fetchedAt)
        assertEquals("Super Mario World", last.value.single().title)
    }

    @Test
    fun `offline with nothing cached, fails`() = runTest {
        server.respond = { throw IOException("offline") }
        val error = expectApiException { repository.games("ra").toList() }
        assertEquals("network", error.code)
    }

    @Test
    fun `a cached copy is not shown once the session has ended`() = runTest {
        server.respond = { 200 to gamesJson }
        repository.games("ra").toList()

        server.respond = { 401 to """{"error":"Not signed in.","code":"unauthenticated"}""" }
        val emitted = mutableListOf<Cached<List<GameSummary>>>()
        val error = expectApiException { repository.games("ra").toList(emitted) }
        assertEquals("unauthenticated", error.code)
        assertNull(session.token.value)
        assertTrue(emitted.single().fromCache)
    }

    @Test
    fun `server errors keep the cached copy, with the server's message`() = runTest {
        server.respond = { 200 to gamesJson }
        repository.games("ra").toList()

        server.respond = { 422 to """{"error":"The service rejected the stored key.","code":"provider_credentials_rejected"}""" }
        val last = repository.games("ra").toList().last()
        assertTrue(last.refreshError!!.isCredentialsRejected)
        assertEquals("The service rejected the stored key.", last.refreshError?.message)
    }

    @Test
    fun `a row that no longer decodes is a cache miss`() = runTest {
        dao.put(CachedResponse("games/ra", "ra", "not json", 1L))
        server.respond = { 200 to gamesJson }
        val emitted = repository.games("ra").toList()
        assertEquals(listOf(false), emitted.map { it.fromCache })
    }

    @Test
    fun `game details are cached per game`() = runTest {
        server.respond = { request ->
            val id = request.url.pathSegments.last()
            200 to """{"game":{"id":"$id","title":"Game $id","achievements":[{"id":"a1","title":"First","earned":true}]}}"""
        }
        repository.game("ra", "1").toList()
        repository.game("ra", "2").toList()

        server.respond = { throw IOException("offline") }
        assertEquals("Game 1", repository.game("ra", "1").toList().last().value.title)
        assertEquals("First", repository.game("ra", "2").toList().last().value.achievements.single().title)
    }

    @Test
    fun `disconnecting forgets that service and the providers list, but not other services`() = runTest {
        server.respond = { request ->
            when (request.url.pathSegments.drop(1).joinToString("/")) {
                "providers" -> 200 to """{"providers":[{"id":"ra","name":"RetroAchievements"}]}"""
                "connections/ra" -> 200 to "{}"
                else -> 200 to gamesJson
            }
        }
        repository.providers().toList()
        repository.games("ra").toList()
        repository.recent("ra").toList()
        repository.games("demo").toList()

        repository.disconnect("ra")

        assertNull(dao.get("providers"))
        assertNull(dao.get("games/ra"))
        assertNull(dao.get("recent/ra"))
        assertNotNull(dao.get("games/demo"))
    }

    @Test
    fun `connecting forgets the service's old data`() = runTest {
        server.respond = { 200 to gamesJson }
        repository.games("ra").toList()

        server.respond = { 200 to """{"connection":{"id":1,"providerId":"ra","externalId":"p2","displayName":"player2"}}""" }
        repository.connect("ra", mapOf("apiKey" to "k"))

        assertNull(dao.get("games/ra"))
    }

    @Test
    fun `clear drops everything`() = runTest {
        server.respond = { 200 to gamesJson }
        repository.games("ra").toList()
        repository.games("demo").toList()

        repository.clear()

        assertNull(dao.get("games/ra"))
        assertNull(dao.get("games/demo"))
    }

    private suspend fun expectApiException(block: suspend () -> Unit): ApiException {
        try {
            block()
        } catch (e: ApiException) {
            return e
        }
        fail("Expected ApiException")
        throw AssertionError()
    }
}
