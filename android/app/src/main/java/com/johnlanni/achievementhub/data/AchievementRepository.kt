package com.johnlanni.achievementhub.data

import com.johnlanni.achievementhub.data.cache.CacheDao
import com.johnlanni.achievementhub.data.cache.CachedResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * A response and when it was fetched. [fromCache] is true while it's the
 * stored copy; [refreshError] is set once refreshing it has failed.
 */
data class Cached<T>(
    val value: T,
    val fetchedAt: Long,
    val fromCache: Boolean,
    val refreshError: ApiException? = null,
)

/**
 * The API, read stale-while-revalidate: each read emits the cached response
 * right away (if there is one), then fetches, stores and emits the fresh one.
 * If the fetch fails, the cached copy is emitted again with the error;
 * with nothing cached, the flow throws the [ApiException].
 */
class AchievementRepository(
    private val api: ApiClient,
    private val cache: CacheDao,
    private val json: Json = AppJson,
    private val now: () -> Long = System::currentTimeMillis,
) {
    fun providers(): Flow<Cached<List<ProviderWithConnection>>> =
        cached(PROVIDERS, null, ListSerializer(ProviderWithConnection.serializer())) { api.providers() }

    fun profile(providerId: String): Flow<Cached<ProfileResponse>> =
        cached("profile/$providerId", providerId, ProfileResponse.serializer()) { api.profile(providerId) }

    fun games(providerId: String): Flow<Cached<List<GameSummary>>> =
        cached("games/$providerId", providerId, ListSerializer(GameSummary.serializer())) { api.games(providerId) }

    fun recent(providerId: String): Flow<Cached<List<RecentAchievement>>> =
        cached("recent/$providerId", providerId, ListSerializer(RecentAchievement.serializer())) { api.recent(providerId) }

    fun game(providerId: String, gameId: String): Flow<Cached<GameDetail>> =
        cached("game/$providerId/$gameId", providerId, GameDetail.serializer()) { api.game(providerId, gameId) }

    /** Connecting may switch to a different account on the service, so its cached data goes. */
    suspend fun connect(providerId: String, credentials: Map<String, String>): Connection =
        api.connect(providerId, credentials).also { forget(providerId) }

    suspend fun disconnect(providerId: String) {
        api.disconnect(providerId)
        forget(providerId)
    }

    /** Clears the server's cache for the connection; the next reads fetch fresh data. */
    suspend fun refresh(providerId: String) = api.refresh(providerId)

    /** Drops everything cached, e.g. on sign-out. */
    suspend fun clear() = cache.clear()

    private suspend fun forget(providerId: String) {
        cache.deleteProvider(providerId)
        // The providers list embeds each connection, so it's stale too.
        cache.delete(PROVIDERS)
    }

    private fun <T> cached(
        key: String,
        providerId: String?,
        serializer: KSerializer<T>,
        fetch: suspend () -> T,
    ): Flow<Cached<T>> = flow {
        // A row that no longer decodes (e.g. after a model change) is just a cache miss.
        val stored: Cached<T>? = cache.get(key)?.let { row ->
            runCatching { json.decodeFromString(serializer, row.json) }.getOrNull()
                ?.let { Cached<T>(it, row.fetchedAt, fromCache = true) }
        }
        if (stored != null) emit(stored)

        val fresh = try {
            fetch()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val error = e as? ApiException ?: ApiException(0, null, e.message ?: "Something went wrong.")
            // Signed out: the session is gone, so don't keep showing the old account's data.
            if (stored == null || error.code == "unauthenticated") throw error
            emit(stored.copy(refreshError = error))
            return@flow
        }
        val fetchedAt = now()
        cache.put(CachedResponse(key, providerId, json.encodeToString(serializer, fresh), fetchedAt))
        emit(Cached(fresh, fetchedAt, fromCache = false))
    }

    private companion object {
        const val PROVIDERS = "providers"
    }
}
