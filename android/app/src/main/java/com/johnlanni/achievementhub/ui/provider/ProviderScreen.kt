package com.johnlanni.achievementhub.ui.provider

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.johnlanni.achievementhub.data.AchievementRepository
import com.johnlanni.achievementhub.data.ApiException
import com.johnlanni.achievementhub.data.GameSummary
import com.johnlanni.achievementhub.data.ProfileResponse
import com.johnlanni.achievementhub.data.RecentAchievement
import com.johnlanni.achievementhub.ui.Loadable
import com.johnlanni.achievementhub.ui.collectLoadable
import com.johnlanni.achievementhub.ui.components.AwardChip
import com.johnlanni.achievementhub.ui.components.ErrorBox
import com.johnlanni.achievementhub.ui.components.LoadingBox
import com.johnlanni.achievementhub.ui.components.ProgressBar
import com.johnlanni.achievementhub.ui.components.RemoteImage
import com.johnlanni.achievementhub.ui.components.StaleBanner
import com.johnlanni.achievementhub.ui.components.focusHighlight
import com.johnlanni.achievementhub.ui.components.pageScrollKeys
import com.johnlanni.achievementhub.ui.components.rememberInitialFocus
import com.johnlanni.achievementhub.ui.firstRefreshFailure
import com.johnlanni.achievementhub.ui.formatDate
import com.johnlanni.achievementhub.ui.percent
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class ProviderViewModel(private val repository: AchievementRepository, private val providerId: String) : ViewModel() {
    var profile by mutableStateOf<Loadable<ProfileResponse>>(Loadable.Loading)
        private set
    var games by mutableStateOf<Loadable<List<GameSummary>>>(Loadable.Loading)
        private set
    var recent by mutableStateOf<Loadable<List<RecentAchievement>>>(Loadable.Loading)
        private set
    var query by mutableStateOf(GameQuery())
    var busy by mutableStateOf(false)
        private set
    var actionError by mutableStateOf<String?>(null)
        private set

    private var loading: Job? = null

    init {
        load()
    }

    fun load() {
        loading?.cancel()
        loading = viewModelScope.launch {
            launch { repository.profile(providerId).collectLoadable { profile = it } }
            launch { repository.games(providerId).collectLoadable { games = it } }
            launch { repository.recent(providerId).collectLoadable { recent = it } }
        }
    }

    /** Clears the server's cache for this connection, then reloads. */
    fun refresh() = runAction {
        repository.refresh(providerId)
        load()
    }

    fun disconnect(onDisconnected: () -> Unit) = runAction {
        repository.disconnect(providerId)
        onDisconnected()
    }

    private fun runAction(block: suspend () -> Unit) {
        if (busy) return
        busy = true
        actionError = null
        viewModelScope.launch {
            try {
                block()
            } catch (e: ApiException) {
                actionError = e.message
            } finally {
                busy = false
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProviderScreen(
    profile: Loadable<ProfileResponse>,
    games: Loadable<List<GameSummary>>,
    recent: Loadable<List<RecentAchievement>>,
    query: GameQuery,
    busy: Boolean,
    actionError: String?,
    onQueryChange: (GameQuery) -> Unit,
    onOpenGame: (gameId: String) -> Unit,
    onRefresh: () -> Unit,
    onUpdateCredentials: () -> Unit,
    onDisconnect: () -> Unit,
    onRetry: () -> Unit,
    onBack: () -> Unit,
) {
    var confirmDisconnect by rememberSaveable { mutableStateOf(false) }
    val title = (profile as? Loadable.Ready)?.value?.provider?.name ?: "Achievements"

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { TextButton(onClick = onBack, modifier = Modifier.focusHighlight()) { Text("Back") } },
            )
        },
    ) { padding ->
        val listState = rememberLazyListState()
        val scope = rememberCoroutineScope()
        val visibleGames = remember(games, query) { (games as? Loadable.Ready)?.value?.applyQuery(query) }
        val platforms = remember(games) { (games as? Loadable.Ready)?.value?.platforms().orEmpty() }
        val stale = firstRefreshFailure(profile, games, recent)

        LazyColumn(
            state = listState,
            modifier = Modifier.padding(padding).fillMaxSize().pageScrollKeys(listState, scope),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (stale != null) {
                item {
                    // Saved data is still shown when the service rejects the stored key; offer to re-enter it.
                    val updateAction: (@Composable () -> Unit)? = if (stale.error?.isCredentialsRejected == true) {
                        @Composable { OutlinedButton(onClick = onUpdateCredentials) { Text("Update credentials") } }
                    } else {
                        null
                    }
                    StaleBanner(stale, extraAction = updateAction)
                }
            }
            item {
                when (profile) {
                    Loadable.Loading -> LoadingBox()
                    is Loadable.Failed -> {
                        // The service rejected the stored key: offer to re-enter it.
                        val updateAction: (@Composable () -> Unit)? = if (profile.error.isCredentialsRejected) {
                            @Composable { OutlinedButton(onClick = onUpdateCredentials) { Text("Update credentials") } }
                        } else {
                            null
                        }
                        ErrorBox(profile.error, onRetry = onRetry, extraAction = updateAction)
                    }
                    is Loadable.Ready -> ProfileHeader(
                        profile.value,
                        busy = busy,
                        onRefresh = onRefresh,
                        onUpdateCredentials = onUpdateCredentials,
                        onDisconnect = { confirmDisconnect = true },
                    )
                }
            }
            actionError?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }

            item { SectionTitle("Recently earned") }
            item { RecentStrip(recent, onOpenGame) }

            item {
                val count = visibleGames?.let { " (${it.size})" }.orEmpty()
                SectionTitle("Games$count")
            }
            item { GameControls(query, platforms, onQueryChange) }
            when (games) {
                Loadable.Loading -> item { LoadingBox() }
                is Loadable.Failed -> item { ErrorBox(games.error, onRetry = onRetry) }
                is Loadable.Ready -> {
                    if (visibleGames.isNullOrEmpty()) item { Text("No games match.") }
                    items(visibleGames.orEmpty(), key = { it.id }) { game -> GameRow(game, onClick = { onOpenGame(game.id) }) }
                }
            }
        }
    }

    if (confirmDisconnect) {
        AlertDialog(
            onDismissRequest = { confirmDisconnect = false },
            title = { Text("Disconnect this service?") },
            text = { Text("Your stored credentials for it will be deleted.") },
            confirmButton = {
                TextButton(onClick = { confirmDisconnect = false; onDisconnect() }) { Text("Disconnect") }
            },
            dismissButton = { TextButton(onClick = { confirmDisconnect = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun ProfileHeader(
    data: ProfileResponse,
    busy: Boolean,
    onRefresh: () -> Unit,
    onUpdateCredentials: () -> Unit,
    onDisconnect: () -> Unit,
) {
    val profile = data.profile
    val firstButton = rememberInitialFocus(profile.externalId)
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RemoteImage(profile.avatarUrl, 72.dp, shape = CircleShape)
            Spacer(Modifier.width(16.dp))
            Column {
                Text(data.provider.name.uppercase(), style = MaterialTheme.typography.labelSmall)
                Text(profile.displayName, style = MaterialTheme.typography.headlineSmall)
                profile.motto?.let { Text("“$it”", color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = onRefresh,
                enabled = !busy,
                modifier = Modifier.focusRequester(firstButton).focusHighlight(),
            ) { Text("Refresh") }
            OutlinedButton(onClick = onUpdateCredentials, modifier = Modifier.focusHighlight()) { Text("Credentials") }
            OutlinedButton(onClick = onDisconnect, enabled = !busy, modifier = Modifier.focusHighlight()) {
                Text("Disconnect", color = MaterialTheme.colorScheme.error)
            }
        }
        profile.stats.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { stat ->
                    Card(Modifier.weight(1f)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(stat.label, style = MaterialTheme.typography.labelSmall)
                            Text(stat.value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun RecentStrip(recent: Loadable<List<RecentAchievement>>, onOpenGame: (String) -> Unit) {
    when (recent) {
        Loadable.Loading -> LoadingBox()
        is Loadable.Failed -> Text(recent.error.message, color = MaterialTheme.colorScheme.error)
        is Loadable.Ready -> if (recent.value.isEmpty()) {
            Text("No achievements earned in the last 30 days.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(recent.value, key = { it.gameId + "/" + it.id + "/" + it.earnedAt }) { item ->
                    Card(onClick = { onOpenGame(item.gameId) }, modifier = Modifier.width(260.dp).focusHighlight()) {
                        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            RemoteImage(item.badgeUrl, 48.dp)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(item.title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(item.gameTitle, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                val points = item.points?.let { " · $it pts" }.orEmpty()
                                Text(formatDate(item.earnedAt) + points, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GameControls(query: GameQuery, platforms: List<String>, onQueryChange: (GameQuery) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = query.search,
            onValueChange = { onQueryChange(query.copy(search = it)) },
            label = { Text("Search games") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(GameFilter.entries) { filter ->
                FilterChip(
                    selected = query.filter == filter,
                    onClick = { onQueryChange(query.copy(filter = filter)) },
                    label = { Text(filter.label) },
                    modifier = Modifier.focusHighlight(),
                )
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(GameSort.entries) { sort ->
                FilterChip(
                    selected = query.sort == sort,
                    onClick = { onQueryChange(query.copy(sort = sort)) },
                    label = { Text(sort.label) },
                    modifier = Modifier.focusHighlight(),
                )
            }
        }
        if (platforms.size > 1) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(
                        selected = query.platform == null,
                        onClick = { onQueryChange(query.copy(platform = null)) },
                        label = { Text("All platforms") },
                        modifier = Modifier.focusHighlight(),
                    )
                }
                items(platforms) { platform ->
                    FilterChip(
                        selected = query.platform == platform,
                        onClick = { onQueryChange(query.copy(platform = platform)) },
                        label = { Text(platform) },
                        modifier = Modifier.focusHighlight(),
                    )
                }
            }
        }
    }
}

@Composable
private fun GameRow(game: GameSummary, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth().focusHighlight()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            RemoteImage(game.iconUrl, 56.dp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        game.title,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Spacer(Modifier.width(8.dp))
                    AwardChip(game.awardKind)
                }
                val lastEarned = formatDate(game.lastEarnedAt).takeIf { it.isNotEmpty() }?.let { " · last earned $it" }.orEmpty()
                Text(game.platform.orEmpty() + lastEarned, style = MaterialTheme.typography.bodySmall)
                ProgressBar(game.earned, game.total, game.earnedHardcore)
            }
            Spacer(Modifier.width(14.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text("${percent(game.earned, game.total)}%", fontWeight = FontWeight.Bold)
                Text("${game.earned}/${game.total}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
