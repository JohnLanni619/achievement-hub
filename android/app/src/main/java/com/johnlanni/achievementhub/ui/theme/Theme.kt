package com.johnlanni.achievementhub.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Same palette as the web app (web/src/styles.css).
private val Light = lightColorScheme(
    primary = Color(0xFF5B4BDB),
    onPrimary = Color.White,
    background = Color(0xFFF5F6F8),
    surface = Color.White,
    onSurface = Color(0xFF1B1F24),
    error = Color(0xFFC93C3C),
)

private val Dark = darkColorScheme(
    primary = Color(0xFF8B7DFF),
    onPrimary = Color(0xFF0F1115),
    background = Color(0xFF0F1115),
    surface = Color(0xFF181B21),
    onSurface = Color(0xFFE8EAED),
    error = Color(0xFFFF7070),
)

@Composable
fun AchievementHubTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (darkTheme) Dark else Light, content = content)
}
