package com.johnlanni.achievementhub.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.johnlanni.achievementhub.data.Achievement
import com.johnlanni.achievementhub.data.Connection
import com.johnlanni.achievementhub.data.GameDetail
import com.johnlanni.achievementhub.data.Profile
import com.johnlanni.achievementhub.data.ProviderWithConnection
import com.johnlanni.achievementhub.data.Stat
import com.johnlanni.achievementhub.ui.dashboard.DashboardScreen
import com.johnlanni.achievementhub.ui.game.AchievementFilter
import com.johnlanni.achievementhub.ui.game.AchievementSort
import com.johnlanni.achievementhub.ui.game.GameScreen
import com.johnlanni.achievementhub.ui.signin.NotConfiguredScreen
import com.johnlanni.achievementhub.ui.signin.SignInScreen
import com.johnlanni.achievementhub.ui.signin.SignInUi
import com.johnlanni.achievementhub.ui.theme.AchievementHubTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Smoke tests: each screen renders its data and reacts to input. Images are null so nothing hits the network. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w800dp-h2000dp")
class ScreensTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `dashboard lists connected and available services`() {
        val providers = listOf(
            ProviderWithConnection(
                id = "demo",
                name = "Demo Provider",
                connection = Connection(id = 1, providerId = "demo", externalId = "p1", displayName = "player1"),
            ),
            ProviderWithConnection(id = "retroachievements", name = "RetroAchievements", description = "Classic games"),
        )
        val profiles = mapOf("demo" to Loadable.Ready(Profile("p1", "player1", stats = listOf(Stat("Points", "339")))))
        var opened: String? = null
        var connecting: String? = null
        compose.setContent {
            AchievementHubTheme {
                DashboardScreen(
                    providers = Loadable.Ready(providers),
                    profiles = profiles,
                    onOpen = { opened = it },
                    onConnect = { connecting = it },
                    onRetry = {},
                    onSignOut = {},
                )
            }
        }
        compose.onNodeWithText("player1").assertExists()
        compose.onNodeWithText("339").assertExists()
        compose.onNodeWithText("View achievements →").performClick()
        compose.onNodeWithText("Connect RetroAchievements").performClick()
        assertEquals("demo", opened)
        assertEquals("retroachievements", connecting)
    }

    @Test
    fun `game screen filters achievements`() {
        val game = GameDetail(
            id = "228",
            title = "Super Mario World",
            earned = 1,
            total = 2,
            achievements = listOf(
                Achievement(id = "1", title = "Earned one", earned = true, rarity = 75.0),
                Achievement(id = "2", title = "Still locked", earned = false, rarity = 10.0),
            ),
        )
        compose.setContent {
            var filter by remember { mutableStateOf(AchievementFilter.All) }
            AchievementHubTheme {
                GameScreen(
                    game = Loadable.Ready(game),
                    filter = filter,
                    sort = AchievementSort.Default,
                    onFilterChange = { filter = it },
                    onSortChange = {},
                    onRetry = {},
                    onBack = {},
                )
            }
        }
        compose.onNodeWithText("1 of 2 achievements (50%)").assertExists()
        compose.onNodeWithText("Earned one").assertExists()
        compose.onNodeWithText("Still locked").assertExists()

        compose.onNodeWithText("Locked").performClick()
        compose.onNodeWithText("Earned one").assertDoesNotExist()
        compose.onNodeWithText("Still locked").assertExists()
    }

    @Test
    fun `sign-in shows errors and the not-configured state`() {
        compose.setContent {
            AchievementHubTheme { SignInScreen(SignInUi(error = "No Google account is available."), onSignIn = {}) }
        }
        compose.onNodeWithText("Continue with Google").assertExists()
        compose.onNodeWithText("No Google account is available.").assertExists()
    }

    @Test
    fun `not-configured builds explain what's missing`() {
        compose.setContent { AchievementHubTheme { NotConfiguredScreen() } }
        compose.onNodeWithText("Achievement Hub").assertExists()
    }
}
