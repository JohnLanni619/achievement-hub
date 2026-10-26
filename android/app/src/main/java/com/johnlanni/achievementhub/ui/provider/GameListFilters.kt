package com.johnlanni.achievementhub.ui.provider

import com.johnlanni.achievementhub.data.GameSummary
import com.johnlanni.achievementhub.ui.percent
import java.text.Collator

// Ported from FILTERS/SORTS in web/src/pages/ProviderPage.tsx; keep the two in sync.

enum class GameFilter(val label: String) {
    All("All games"),
    InProgress("In progress"),
    Finished("100% complete"),
    NotStarted("Not started"),
    ;

    fun matches(game: GameSummary): Boolean = when (this) {
        All -> true
        InProgress -> game.earned > 0 && game.earned < game.total
        Finished -> game.total > 0 && game.earned >= game.total
        NotStarted -> game.earned == 0
    }
}

enum class GameSort(val label: String) {
    Recent("Recently played"),
    Progress("Completion"),
    Title("Title"),
    Total("Most achievements"),
    ;

    val comparator: Comparator<GameSummary>
        get() = when (this) {
            // Missing dates sort last, as "" does in the web's localeCompare.
            Recent -> compareByDescending<GameSummary> { it.lastEarnedAt.orEmpty() }
            Progress -> compareByDescending<GameSummary> { percent(it.earned, it.total) }.thenByDescending { it.earned }
            Title -> Comparator<GameSummary> { a, b -> titleCollator.compare(a.title, b.title) }
            Total -> compareByDescending<GameSummary> { it.total }
        }

    private companion object {
        val titleCollator: Collator = Collator.getInstance()
    }
}

data class GameQuery(
    val search: String = "",
    val filter: GameFilter = GameFilter.All,
    val sort: GameSort = GameSort.Recent,
    /** null = all platforms. */
    val platform: String? = null,
)

fun List<GameSummary>.applyQuery(query: GameQuery): List<GameSummary> {
    val search = query.search.trim()
    return filter { query.filter.matches(it) }
        .filter { query.platform == null || it.platform == query.platform }
        .filter { search.isEmpty() || it.title.contains(search, ignoreCase = true) }
        .sortedWith(query.sort.comparator)
}

fun List<GameSummary>.platforms(): List<String> = mapNotNull { it.platform }.distinct().sorted()
