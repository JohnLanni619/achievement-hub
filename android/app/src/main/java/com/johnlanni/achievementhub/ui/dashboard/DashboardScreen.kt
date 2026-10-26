package com.johnlanni.achievementhub.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.johnlanni.achievementhub.data.ApiClient
import com.johnlanni.achievementhub.data.Profile
import com.johnlanni.achievementhub.data.ProviderWithConnection
import com.johnlanni.achievementhub.ui.Loadable
import com.johnlanni.achievementhub.ui.components.ErrorBox
import com.johnlanni.achievementhub.ui.components.LoadingBox
import com.johnlanni.achievementhub.ui.components.RemoteImage
import com.johnlanni.achievementhub.ui.components.focusHighlight
import com.johnlanni.achievementhub.ui.components.pageScrollKeys
import com.johnlanni.achievementhub.ui.components.rememberInitialFocus
import com.johnlanni.achievementhub.ui.loadCatching
import kotlinx.coroutines.launch

class DashboardViewModel(private val api: ApiClient) : ViewModel() {
    var providers by mutableStateOf<Loadable<List<ProviderWithConnection>>>(Loadable.Loading)
        private set

    /** Profile summaries for connected providers, keyed by provider id. */
    val profiles = mutableStateMapOf<String, Loadable<Profile>>()

    fun load() {
        viewModelScope.launch {
            if (providers !is Loadable.Ready) providers = Loadable.Loading
            val result = loadCatching { api.providers() }
            providers = result
            if (result is Loadable.Ready) {
                result.value.filter { it.connection != null }.forEach { provider ->
                    launch { profiles[provider.id] = loadCatching { api.profile(provider.id).profile } }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    providers: Loadable<List<ProviderWithConnection>>,
    profiles: Map<String, Loadable<Profile>>,
    onOpen: (providerId: String) -> Unit,
    onConnect: (providerId: String) -> Unit,
    onRetry: () -> Unit,
    onSignOut: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Achievement Hub") },
                actions = { TextButton(onClick = onSignOut, modifier = Modifier.focusHighlight()) { Text("Sign out") } },
            )
        },
    ) { padding ->
        when (providers) {
            Loadable.Loading -> LoadingBox(Modifier.padding(padding))
            is Loadable.Failed -> ErrorBox(providers.error, Modifier.padding(padding).padding(16.dp), onRetry = onRetry)
            is Loadable.Ready -> DashboardList(providers.value, profiles, onOpen, onConnect, Modifier.padding(padding))
        }
    }
}

@Composable
private fun DashboardList(
    all: List<ProviderWithConnection>,
    profiles: Map<String, Loadable<Profile>>,
    onOpen: (String) -> Unit,
    onConnect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val connected = all.filter { it.connection != null }
    val available = all.filter { it.connection == null }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val firstFocus = rememberInitialFocus(all)

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().pageScrollKeys(listState, scope),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { SectionTitle("Connected services") }
        if (connected.isEmpty()) {
            item { Text("You haven't connected any services yet. Pick one below to get started.") }
        }
        items(connected, key = { "c-" + it.id }) { provider ->
            val focus = if (provider == connected.first()) Modifier.focusRequester(firstFocus) else Modifier
            ConnectedCard(provider, profiles[provider.id], onClick = { onOpen(provider.id) }, modifier = focus)
        }
        if (available.isNotEmpty()) {
            item { SectionTitle("Add a service", Modifier.padding(top = 12.dp)) }
            items(available, key = { "a-" + it.id }) { provider ->
                val focus = if (connected.isEmpty() && provider == available.first()) Modifier.focusRequester(firstFocus) else Modifier
                AvailableCard(provider, onConnect = { onConnect(provider.id) }, modifier = focus)
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier = modifier, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun ConnectedCard(
    provider: ProviderWithConnection,
    profile: Loadable<Profile>?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(onClick = onClick, modifier = modifier.fillMaxWidth().focusHighlight()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val avatar = (profile as? Loadable.Ready)?.value?.avatarUrl
                RemoteImage(avatar, 48.dp, shape = CircleShape)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(provider.name.uppercase(), style = MaterialTheme.typography.labelSmall)
                    Text(provider.connection?.displayName.orEmpty(), style = MaterialTheme.typography.titleMedium)
                }
            }
            when (profile) {
                null, Loadable.Loading -> Text("Loading profile…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                is Loadable.Failed -> Text(profile.error.message, color = MaterialTheme.colorScheme.error)
                is Loadable.Ready -> Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                    profile.value.stats.take(3).forEach { stat ->
                        Column {
                            Text(stat.label, style = MaterialTheme.typography.labelSmall)
                            Text(stat.value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Text("View achievements →", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun AvailableCard(provider: ProviderWithConnection, onConnect: () -> Unit, modifier: Modifier = Modifier) {
    Card(modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(provider.name, style = MaterialTheme.typography.titleMedium)
            if (provider.description.isNotEmpty()) {
                Text(provider.description, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Button(onClick = onConnect, modifier = Modifier.focusHighlight()) { Text("Connect ${provider.name}") }
        }
    }
}
