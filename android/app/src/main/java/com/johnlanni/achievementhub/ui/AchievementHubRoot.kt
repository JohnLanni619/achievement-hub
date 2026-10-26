package com.johnlanni.achievementhub.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.johnlanni.achievementhub.AppContainer
import com.johnlanni.achievementhub.ui.components.LoadingBox
import com.johnlanni.achievementhub.ui.connect.ConnectScreen
import com.johnlanni.achievementhub.ui.connect.ConnectViewModel
import com.johnlanni.achievementhub.ui.dashboard.DashboardScreen
import com.johnlanni.achievementhub.ui.dashboard.DashboardViewModel
import com.johnlanni.achievementhub.ui.game.GameScreen
import com.johnlanni.achievementhub.ui.game.GameViewModel
import com.johnlanni.achievementhub.ui.provider.ProviderScreen
import com.johnlanni.achievementhub.ui.provider.ProviderViewModel
import com.johnlanni.achievementhub.ui.signin.NotConfiguredScreen
import com.johnlanni.achievementhub.ui.signin.SignInScreen
import com.johnlanni.achievementhub.ui.signin.SignInViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable object DashboardRoute
@Serializable data class ConnectRoute(val providerId: String)
@Serializable data class ProviderRoute(val providerId: String)
@Serializable data class GameRoute(val providerId: String, val gameId: String)

/** Not configured → sign in → the main screens. Signing out (or an expired session) returns to sign-in. */
@Composable
fun AchievementHubRoot(container: AppContainer) {
    if (!container.config.isConfigured) {
        NotConfiguredScreen()
        return
    }
    val ready by container.session.ready.collectAsStateWithLifecycle()
    val token by container.session.token.collectAsStateWithLifecycle()
    when {
        !ready -> LoadingBox()
        token == null -> {
            val vm = viewModel { SignInViewModel(container.api, container.session, container.googleSignIn) }
            val activity = LocalContext.current
            SignInScreen(vm.ui, onSignIn = { vm.signIn(activity) })
        }
        else -> MainNavigation(container)
    }
}

@Composable
private fun MainNavigation(container: AppContainer) {
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    val api = container.api

    NavHost(navController = nav, startDestination = DashboardRoute) {
        composable<DashboardRoute> {
            val vm = viewModel { DashboardViewModel(api) }
            // Reload whenever the dashboard is shown again, e.g. after connecting a service.
            LaunchedEffect(Unit) { vm.load() }
            DashboardScreen(
                providers = vm.providers,
                profiles = vm.profiles,
                onOpen = { nav.navigate(ProviderRoute(it)) },
                onConnect = { nav.navigate(ConnectRoute(it)) },
                onRetry = vm::load,
                onSignOut = {
                    scope.launch {
                        runCatching { api.logout() }
                        container.session.clear()
                    }
                },
            )
        }
        composable<ConnectRoute> { entry ->
            val route = entry.toRoute<ConnectRoute>()
            val vm = viewModel { ConnectViewModel(api, route.providerId) }
            ConnectScreen(
                provider = vm.provider,
                values = vm.values,
                submitting = vm.submitting,
                error = vm.error,
                onValueChange = { name, value -> vm.values[name] = value },
                onSubmit = {
                    vm.submit {
                        nav.navigate(ProviderRoute(route.providerId)) { popUpTo(DashboardRoute) }
                    }
                },
                onRetry = vm::load,
                onBack = { nav.popBackStack() },
            )
        }
        composable<ProviderRoute> { entry ->
            val route = entry.toRoute<ProviderRoute>()
            val vm = viewModel { ProviderViewModel(api, route.providerId) }
            ProviderScreen(
                profile = vm.profile,
                games = vm.games,
                recent = vm.recent,
                query = vm.query,
                busy = vm.busy,
                actionError = vm.actionError,
                onQueryChange = { vm.query = it },
                onOpenGame = { nav.navigate(GameRoute(route.providerId, it)) },
                onRefresh = vm::refresh,
                onUpdateCredentials = { nav.navigate(ConnectRoute(route.providerId)) },
                onDisconnect = { vm.disconnect { nav.popBackStack(DashboardRoute, inclusive = false) } },
                onRetry = vm::load,
                onBack = { nav.popBackStack() },
            )
        }
        composable<GameRoute> { entry ->
            val route = entry.toRoute<GameRoute>()
            val vm = viewModel { GameViewModel(api, route.providerId, route.gameId) }
            GameScreen(
                game = vm.game,
                filter = vm.filter,
                sort = vm.sort,
                onFilterChange = { vm.filter = it },
                onSortChange = { vm.sort = it },
                onRetry = vm::load,
                onBack = { nav.popBackStack() },
            )
        }
    }
}
