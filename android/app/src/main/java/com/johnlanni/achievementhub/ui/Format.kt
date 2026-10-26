package com.johnlanni.achievementhub.ui

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Whole-number percentage, rounding halves up like the web app's Math.round. */
fun percent(value: Int, total: Int): Int = if (total > 0) Math.round(value * 100.0 / total).toInt() else 0

private val dateFormatter: DateTimeFormatter =
    DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withZone(ZoneId.systemDefault())

/** "Oct 26, 2026" for an ISO-8601 timestamp, or "" if missing or unparseable. */
fun formatDate(iso: String?): String =
    iso?.let { runCatching { dateFormatter.format(Instant.parse(it)) }.getOrNull() } ?: ""

/** "updated just now", "updated 5 min ago", "updated 3 h ago", or "updated Oct 24, 2026". */
fun formatUpdated(fetchedAt: Long, now: Long): String {
    val minutes = (now - fetchedAt).coerceAtLeast(0) / 60_000
    return when {
        minutes < 1 -> "updated just now"
        minutes < 60 -> "updated $minutes min ago"
        minutes < 24 * 60 -> "updated ${minutes / 60} h ago"
        else -> "updated " + dateFormatter.format(Instant.ofEpochMilli(fetchedAt))
    }
}
