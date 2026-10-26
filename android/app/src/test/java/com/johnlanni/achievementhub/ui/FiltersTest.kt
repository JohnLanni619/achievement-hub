package com.johnlanni.achievementhub.ui

import com.johnlanni.achievementhub.data.Achievement
import com.johnlanni.achievementhub.data.GameSummary
import com.johnlanni.achievementhub.ui.game.AchievementFilter
import com.johnlanni.achievementhub.ui.game.AchievementSort
import com.johnlanni.achievementhub.ui.game.applyFilters
import com.johnlanni.achievementhub.ui.game.formatRarity
import com.johnlanni.achievementhub.ui.provider.GameFilter
import com.johnlanni.achievementhub.ui.provider.GameQuery
import com.johnlanni.achievementhub.ui.provider.GameSort
import com.johnlanni.achievementhub.ui.provider.applyQuery
import com.johnlanni.achievementhub.ui.provider.platforms
import org.junit.Assert.assertEquals
import org.junit.Test

class FiltersTest {
    private fun game(id: String, earned: Int, total: Int, last: String? = null, platform: String? = "SNES", title: String = id) =
        GameSummary(id = id, title = title, platform = platform, earned = earned, total = total, lastEarnedAt = last)

    private val games = listOf(
        game("mastered", 10, 10, last = "2026-01-05T00:00:00Z"),
        game("half", 5, 10, last = "2026-03-01T00:00:00Z", platform = "Genesis"),
        game("fresh", 0, 20),
        game("empty", 0, 0),
    )

    private fun ids(query: GameQuery) = games.applyQuery(query).map { it.id }

    @Test
    fun `status filters match the web app`() {
        assertEquals(listOf("half"), ids(GameQuery(filter = GameFilter.InProgress)))
        // A game with no achievements is never "100% complete".
        assertEquals(listOf("mastered"), ids(GameQuery(filter = GameFilter.Finished)))
        assertEquals(listOf("fresh", "empty"), ids(GameQuery(filter = GameFilter.NotStarted)))
    }

    @Test
    fun `recent sort puts games without a date last`() {
        assertEquals(listOf("half", "mastered", "fresh", "empty"), ids(GameQuery(sort = GameSort.Recent)))
    }

    @Test
    fun `progress sort breaks ties by achievements earned`() {
        val tied = listOf(game("a", 1, 2), game("b", 5, 10), game("c", 10, 10))
        assertEquals(listOf("c", "b", "a"), tied.applyQuery(GameQuery(sort = GameSort.Progress)).map { it.id })
    }

    @Test
    fun `search, platform, title and total sorts`() {
        assertEquals(listOf("half"), ids(GameQuery(search = " HAL ")))
        assertEquals(listOf("half"), ids(GameQuery(platform = "Genesis")))
        assertEquals(listOf("empty", "fresh", "half", "mastered"), ids(GameQuery(sort = GameSort.Title)))
        assertEquals(listOf("fresh", "mastered", "half", "empty"), ids(GameQuery(sort = GameSort.Total)))
        assertEquals(listOf("Genesis", "SNES"), games.platforms())
    }

    private fun achievement(id: String, earned: Boolean, points: Int? = null, rarity: Double? = null, at: String? = null) =
        Achievement(id = id, title = id, points = points, rarity = rarity, earned = earned, earnedAt = at)

    private val achievements = listOf(
        achievement("a", earned = true, points = 5, rarity = 75.0, at = "2026-01-01T00:00:00Z"),
        achievement("b", earned = false, points = 25, rarity = 2.5),
        achievement("c", earned = true, points = 10, at = "2026-02-01T00:00:00Z"),
    )

    private fun ids(filter: AchievementFilter, sort: AchievementSort) = achievements.applyFilters(filter, sort).map { it.id }

    @Test
    fun `achievement filters and sorts`() {
        assertEquals(listOf("a", "b", "c"), ids(AchievementFilter.All, AchievementSort.Default))
        assertEquals(listOf("a", "c"), ids(AchievementFilter.Earned, AchievementSort.Default))
        assertEquals(listOf("b"), ids(AchievementFilter.Locked, AchievementSort.Default))
        assertEquals(listOf("b", "c", "a"), ids(AchievementFilter.All, AchievementSort.Points))
        // Unknown rarity sorts after every known percentage.
        assertEquals(listOf("b", "a", "c"), ids(AchievementFilter.All, AchievementSort.Rarity))
        assertEquals(listOf("c", "a", "b"), ids(AchievementFilter.All, AchievementSort.Earned))
    }

    @Test
    fun `percent rounds halves up like Math round`() {
        assertEquals(0, percent(0, 0))
        assertEquals(50, percent(1, 2))
        assertEquals(17, percent(1, 6))
        assertEquals(13, percent(1, 8)) // 12.5 → 13
    }

    @Test
    fun `formats rarity without a trailing zero`() {
        assertEquals("75", formatRarity(75.0))
        assertEquals("10.5", formatRarity(10.5))
    }
}
