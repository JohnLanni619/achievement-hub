package com.johnlanni.achievementhub.ui.signin

import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.johnlanni.achievementhub.auth.GoogleSignIn
import com.johnlanni.achievementhub.auth.TokenStore
import com.johnlanni.achievementhub.data.ApiClient
import com.johnlanni.achievementhub.data.ApiException
import com.johnlanni.achievementhub.ui.components.focusHighlight
import com.johnlanni.achievementhub.ui.components.rememberInitialFocus
import kotlinx.coroutines.launch

data class SignInUi(val busy: Boolean = false, val error: String? = null)

class SignInViewModel(
    private val api: ApiClient,
    private val session: TokenStore,
    private val googleSignIn: GoogleSignIn,
    /** Drops any data cached for a previous account before the new session starts. */
    private val clearCache: suspend () -> Unit,
) : ViewModel() {
    var ui by mutableStateOf(SignInUi())
        private set

    /** [activityContext] hosts Google's account picker; it isn't kept. */
    fun signIn(activityContext: Context) {
        if (ui.busy) return
        ui = SignInUi(busy = true)
        viewModelScope.launch {
            ui = when (val result = googleSignIn.signIn(activityContext)) {
                is GoogleSignIn.Result.Success -> try {
                    val token = api.exchangeGoogleIdToken(result.idToken).token
                    clearCache()
                    session.save(token)
                    SignInUi()
                } catch (e: ApiException) {
                    SignInUi(error = e.message)
                }
                GoogleSignIn.Result.Cancelled -> SignInUi()
                is GoogleSignIn.Result.Failure -> SignInUi(error = result.message)
            }
        }
    }
}

@Composable
fun SignInScreen(ui: SignInUi, onSignIn: () -> Unit) {
    CenteredColumn {
        Text("Achievement Hub", style = MaterialTheme.typography.headlineMedium)
        Text(
            "All your achievements, from every service, in one place.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        val focus = rememberInitialFocus(Unit)
        Button(
            onClick = onSignIn,
            enabled = !ui.busy,
            modifier = Modifier.fillMaxWidth().focusRequester(focus).focusHighlight(),
        ) {
            if (ui.busy) CircularProgressIndicator(Modifier.padding(end = 8.dp)) else Text("Continue with Google")
        }
        ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}

/** Shown when the APK was built without a server URL or Google client ID. */
@Composable
fun NotConfiguredScreen() {
    CenteredColumn {
        Text("Achievement Hub", style = MaterialTheme.typography.headlineMedium)
        Text(
            "This build isn't configured with a server URL and Google client ID. See android/README.md.",
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun CenteredColumn(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.widthIn(max = 420.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { content() }
    }
}
