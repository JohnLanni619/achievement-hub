package com.johnlanni.achievementhub.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class FormatTest {
    private val now = 1_800_000_000_000L
    private fun minutesAgo(minutes: Long) = now - minutes * 60_000

    @Test
    fun `formats how long ago cached data was fetched`() {
        assertEquals("updated just now", formatUpdated(now - 30_000, now))
        assertEquals("updated 1 min ago", formatUpdated(minutesAgo(1), now))
        assertEquals("updated 59 min ago", formatUpdated(minutesAgo(59), now))
        assertEquals("updated 1 h ago", formatUpdated(minutesAgo(60), now))
        assertEquals("updated 23 h ago", formatUpdated(minutesAgo(23 * 60 + 59), now))
    }

    @Test
    fun `older data shows its date, and a clock behind the fetch time reads as just now`() {
        assertEquals("updated " + formatDate("2027-01-13T08:00:00Z"), formatUpdated(1_800_000_000_000L - 2 * 86_400_000L, now))
        assertEquals("updated just now", formatUpdated(now + 60_000, now))
    }
}
