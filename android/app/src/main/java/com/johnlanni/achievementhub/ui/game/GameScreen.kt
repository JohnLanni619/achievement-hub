package com.johnlanni.achievementhub.ui.game

import androidx.compose.foundation.focusable
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
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.johnlanni.achievementhub.data.Achievement
import com.johnlanni.achievementhub.data.ApiClient
import com.johnlanni.achievementhub.data.GameDetail
import com.johnlanni.achievementhub.ui.Loadable
import com.johnlanni.achievementhub.ui.components.AwardChip
import com.johnlanni.achievementhub.ui.components.ErrorBox
import com.johnlanni.achievementhub.ui.components.LoadingBox
import com.johnlanni.achievementhub.ui.components.ProgressBar
import com.johnlanni.achievementhub.ui.components.RemoteImage
import com.johnlanni.achievementhub.ui.components.focusHighlight
import com.johnlanni.achievementhub.ui.components.pageScrollKeys
import com.johnlanni.achievementhub.ui.components.rememberInitialFocus
import com.johnlanni.achievementhub.ui.formatDate
import com.johnlanni.achievementhub.ui.loadCatching
import com.johnlanni.achievementhub.ui.percent
import kotlinx.coroutines.launch

class GameViewModel(private val api: ApiClient, private val providerId: String, private val gameId: String) : ViewModel() {
    var game by mutableStateOf<Loadable<GameDetail>>(Loadable.Loading)
        private set
    var filter by mutableStateOf(AchievementFilter.All)
    var sort by mutableStateOf(AchievementSort.Default)

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            game = Loadable.Loading
            game = loadCatching { api.game(providerId, gameId) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GameScreen(
    game: Loadable<GameDetail>,
    filter: AchievementFilter,
    sort: AchievementSort,
    onFilterChange: (AchievementFilter) -> Unit,
    onSortChange: (AchievementSort) -> Unit,
    onRetry: () -> Unit,
    onBack: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text((game as? Loadable.Ready)?.value?.title ?: "Game", maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { TextButton(onClick = onBack, modifier = Modifier.focusHighlight()) { Text("Back") } },
            )
        },
    ) { padding ->
        when (game) {
            Loadable.Loading -> LoadingBox(Modifier.padding(padding))
            is Loadable.Failed -> ErrorBox(game.error, Modifier.padding(padding).padding(16.dp), onRetry = onRetry)
            is Loadable.Ready -> GameContent(game.value, filter, sort, onFilterChange, onSortChange, Modifier.padding(padding))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GameContent(
    game: GameDetail,
    filter: AchievementFilter,
    sort: AchievementSort,
    onFilterChange: (AchievementFilter) -> Unit,
    onSortChange: (AchievementSort) -> Unit,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val achievements = remember(game, filter, sort) { game.achievements.applyFilters(filter, sort) }
    val firstChip = rememberInitialFocus(game.id)

    LazyColumn(
        state = listState,
        modifier = modifier.fillMaxSize().pageScrollKeys(listState, scope),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { GameHeader(game) }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(AchievementFilter.entries) { option ->
                    FilterChip(
                        selected = filter == option,
                        onClick = { onFilterChange(option) },
                        label = { Text(option.label) },
                        modifier = Modifier
                            .then(if (option == AchievementFilter.All) Modifier.focusRequester(firstChip) else Modifier)
                            .focusHighlight(),
                    )
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(AchievementSort.entries) { option ->
                    FilterChip(
                        selected = sort == option,
                        onClick = { onSortChange(option) },
                        label = { Text(option.label) },
                        modifier = Modifier.focusHighlight(),
                    )
                }
            }
        }
        when {
            game.total == 0 -> item { Text("This game has no achievements yet.") }
            achievements.isEmpty() -> item { Text("Nothing here.") }
        }
        items(achievements, key = { it.id }) { AchievementRow(it) }
    }
}

@Composable
private fun GameHeader(game: GameDetail) {
    val earnedPoints = game.achievements.filter { it.earned }.sumOf { it.points ?: 0 }
    Row(verticalAlignment = Alignment.Top) {
        RemoteImage(game.imageUrl ?: game.iconUrl, 96.dp)
        Spacer(Modifier.width(16.dp))
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            AwardChip(game.awardKind)
            val meta = listOfNotNull(game.platform, game.genre, game.developer, game.released).joinToString(" · ")
            if (meta.isNotEmpty()) Text(meta, style = MaterialTheme.typography.bodySmall)
            ProgressBar(game.earned, game.total, game.earnedHardcore)
            val points = game.totalPoints?.takeIf { it > 0 }?.let { " · $earnedPoints of $it points" }.orEmpty()
            val hardcore = game.earnedHardcore?.takeIf { it != game.earned }?.let { " · $it in hardcore" }.orEmpty()
            Text(
                "${game.earned} of ${game.total} achievements (${percent(game.earned, game.total)}%)$points$hardcore",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
    }
}

@Composable
private fun AchievementRow(achievement: Achievement) {
    // Focusable (not clickable) so the D-pad steps through achievements one at a time.
    Card(Modifier.fillMaxWidth().focusHighlight().focusable()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            val badge = if (achievement.earned) achievement.badgeUrl else achievement.lockedBadgeUrl ?: achievement.badgeUrl
            RemoteImage(badge, 56.dp, dimmed = !achievement.earned)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(achievement.title, fontWeight = FontWeight.SemiBold)
                    if (achievement.earnedHardcore == true) {
                        Spacer(Modifier.width(8.dp))
                        Text("HARDCORE", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary)
                    }
                }
                if (achievement.description.isNotEmpty()) Text(achievement.description)
                val status = if (achievement.earned) "Earned ${formatDate(achievement.earnedAt)}" else "Locked"
                val rarity = achievement.rarity?.let { " · ${formatRarity(it)}% of players" }.orEmpty()
                Text(status + rarity, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            achievement.points?.let {
                Spacer(Modifier.width(12.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Text("$it", fontWeight = FontWeight.Bold)
                    Text("pts", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

/** 75.0 → "75", 10.5 → "10.5" (the server rounds to one decimal). */
internal fun formatRarity(value: Double): String =
    if (value == Math.floor(value)) value.toLong().toString() else value.toString()
