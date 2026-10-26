package com.johnlanni.achievementhub.ui

import com.johnlanni.achievementhub.data.ApiException
import com.johnlanni.achievementhub.data.Cached
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow

/** Data that is loading, failed, or ready. */
sealed interface Loadable<out T> {
    data object Loading : Loadable<Nothing>
    data class Failed(val error: ApiException) : Loadable<Nothing>

    /** [stale] is set while [value] is the cached copy rather than a fresh response. */
    data class Ready<T>(val value: T, val stale: Stale? = null) : Loadable<T>
}

/** Cached data on screen: when it was fetched, and why refreshing it failed (null while still refreshing). */
data class Stale(val fetchedAt: Long, val error: ApiException?)

/** Transforms the value of a [Loadable.Ready], keeping its staleness. */
fun <T, R> Loadable<T>.map(transform: (T) -> R): Loadable<R> = when (this) {
    Loadable.Loading -> Loadable.Loading
    is Loadable.Failed -> this
    is Loadable.Ready -> Loadable.Ready(transform(value), stale)
}

/** The first refresh failure among [loadables], to explain why cached data is showing. */
fun firstRefreshFailure(vararg loadables: Loadable<*>): Stale? =
    loadables.firstNotNullOfOrNull { (it as? Loadable.Ready<*>)?.stale?.takeIf { stale -> stale.error != null } }

/** Collects a cached-then-fresh flow as [Loadable] states; failing with nothing cached becomes [Loadable.Failed]. */
suspend fun <T> Flow<Cached<T>>.collectLoadable(onEach: (Loadable<T>) -> Unit) {
    try {
        collect { onEach(Loadable.Ready(it.value, if (it.fromCache) Stale(it.fetchedAt, it.refreshError) else null)) }
    } catch (e: CancellationException) {
        throw e
    } catch (e: ApiException) {
        onEach(Loadable.Failed(e))
    } catch (e: Exception) {
        onEach(Loadable.Failed(ApiException(0, null, e.message ?: "Something went wrong.")))
    }
}
