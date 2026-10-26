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
