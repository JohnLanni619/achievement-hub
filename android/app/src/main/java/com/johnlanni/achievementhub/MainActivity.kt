package com.johnlanni.achievementhub

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.johnlanni.achievementhub.ui.theme.AchievementHubTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val config = ApiConfig.fromBuildConfig()
        setContent {
            AchievementHubTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { padding ->
                    StatusScreen(config, Modifier.padding(padding))
                }
            }
        }
    }
}

/** Placeholder until the real screens land; shows whether the build is configured. */
@Composable
fun StatusScreen(config: ApiConfig, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Achievement Hub", style = MaterialTheme.typography.headlineMedium)
        if (config.isConfigured) {
            Text("Server: ${config.baseUrl}", style = MaterialTheme.typography.bodyMedium)
            Text("Version ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall)
        } else {
            Text(
                "This build isn't configured with a server URL and Google client ID. " +
                    "See android/README.md.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun StatusScreenPreview() {
    AchievementHubTheme {
        StatusScreen(ApiConfig("https://achievement-hub.example.workers.dev", "client-id"))
    }
}
