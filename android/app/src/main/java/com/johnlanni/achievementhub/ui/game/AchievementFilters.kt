package com.johnlanni.achievementhub.ui.game

import com.johnlanni.achievementhub.data.Achievement

// Ported from web/src/pages/GamePage.tsx; keep the two in sync.

enum class AchievementFilter(val label: String) {
    All("All"),
    Earned("Earned"),
    Locked("Locked"),
    ;

    fun matches(achievement: Achievement): Boolean = when (this) {
        All -> true
        Earned -> achievement.earned
        Locked -> !achievement.earned
    }
}

enum class AchievementSort(val label: String) {
    Default("Default order"),
    Points("Points"),
    Rarity("Rarest first"),
    Earned("Recently earned"),
    ;

    /** null keeps the server's order. */
    val comparator: Comparator<Achievement>?
        get() = when (this) {
            Default -> null
            Points -> compareByDescending<Achievement> { it.points ?: 0 }
            // Unknown rarity sorts after every real percentage.
            Rarity -> compareBy<Achievement> { it.rarity ?: 101.0 }
            Earned -> compareByDescending<Achievement> { it.earnedAt.orEmpty() }
        }
}

fun List<Achievement>.applyFilters(filter: AchievementFilter, sort: AchievementSort): List<Achievement> {
    val filtered = filter { filter.matches(it) }
    return sort.comparator?.let { filtered.sortedWith(it) } ?: filtered
}
