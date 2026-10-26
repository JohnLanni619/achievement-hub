package com.johnlanni.achievementhub.ui

import com.johnlanni.achievementhub.data.ApiException
import kotlinx.coroutines.CancellationException

/** Data that is loading, failed, or ready. */
sealed interface Loadable<out T> {
    data object Loading : Loadable<Nothing>
    data class Failed(val error: ApiException) : Loadable<Nothing>
    data class Ready<T>(val value: T) : Loadable<T>
}

/** Runs [block], turning any failure into [Loadable.Failed]. */
suspend fun <T> loadCatching(block: suspend () -> T): Loadable<T> = try {
    Loadable.Ready(block())
} catch (e: CancellationException) {
    throw e
} catch (e: ApiException) {
    Loadable.Failed(e)
} catch (e: Exception) {
    Loadable.Failed(ApiException(0, null, e.message ?: "Something went wrong."))
}
