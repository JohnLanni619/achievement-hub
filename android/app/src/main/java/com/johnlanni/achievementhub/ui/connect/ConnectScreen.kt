package com.johnlanni.achievementhub.ui.connect

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.johnlanni.achievementhub.data.AchievementRepository
import com.johnlanni.achievementhub.data.ApiException
import com.johnlanni.achievementhub.data.ProviderWithConnection
import com.johnlanni.achievementhub.ui.Loadable
import com.johnlanni.achievementhub.ui.collectLoadable
import com.johnlanni.achievementhub.ui.components.ErrorBox
import com.johnlanni.achievementhub.ui.components.LoadingBox
import com.johnlanni.achievementhub.ui.components.focusHighlight
import com.johnlanni.achievementhub.ui.components.rememberInitialFocus
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class ConnectViewModel(private val repository: AchievementRepository, private val providerId: String) : ViewModel() {
    var provider by mutableStateOf<Loadable<ProviderWithConnection>>(Loadable.Loading)
        private set
    val values = mutableStateMapOf<String, String>()
    var submitting by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    init {
        load()
    }

    private var loading: Job? = null

    fun load() {
        loading?.cancel()
        loading = viewModelScope.launch {
            provider = Loadable.Loading
            repository.providers().collectLoadable { result ->
                provider = when (result) {
                    is Loadable.Ready -> result.value.firstOrNull { it.id == providerId }?.let { Loadable.Ready(it, result.stale) }
                        ?: Loadable.Failed(ApiException(404, null, "Unknown service."))
                    is Loadable.Failed -> result
                    Loadable.Loading -> Loadable.Loading
                }
            }
        }
    }

    /** Verifies the credentials with the service and saves them; calls [onConnected] on success. */
    fun submit(onConnected: () -> Unit) {
        if (submitting) return
        submitting = true
        error = null
        viewModelScope.launch {
            try {
                repository.connect(providerId, values.mapValues { it.value.trim() })
                onConnected()
            } catch (e: ApiException) {
                error = e.message
            } finally {
                submitting = false
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConnectScreen(
    provider: Loadable<ProviderWithConnection>,
    values: Map<String, String>,
    submitting: Boolean,
    error: String?,
    onValueChange: (name: String, value: String) -> Unit,
    onSubmit: () -> Unit,
    onRetry: () -> Unit,
    onBack: () -> Unit,
) {
    val title = (provider as? Loadable.Ready)?.value?.let { (if (it.connection != null) "Update " else "Connect ") + it.name }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title ?: "Connect") },
                navigationIcon = { TextButton(onClick = onBack, modifier = Modifier.focusHighlight()) { Text("Back") } },
            )
        },
    ) { padding ->
        when (provider) {
            Loadable.Loading -> LoadingBox(Modifier.padding(padding))
            is Loadable.Failed -> ErrorBox(provider.error, Modifier.padding(padding).padding(16.dp), onRetry = onRetry)
            is Loadable.Ready -> ConnectForm(provider.value, values, submitting, error, onValueChange, onSubmit, Modifier.padding(padding))
        }
    }
}

@Composable
private fun ConnectForm(
    provider: ProviderWithConnection,
    values: Map<String, String>,
    submitting: Boolean,
    error: String?,
    onValueChange: (String, String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val firstField = rememberInitialFocus(provider.id)
    val complete = provider.credentialFields.all { !values[it.name].isNullOrBlank() }
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (provider.connectInstructions.isNotEmpty()) {
            Text(provider.connectInstructions, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        provider.credentialFields.forEachIndexed { index, field ->
            OutlinedTextField(
                value = values[field.name].orEmpty(),
                onValueChange = { onValueChange(field.name, it) },
                label = { Text(field.label) },
                placeholder = field.placeholder?.let { text -> @Composable { Text(text) } },
                supportingText = field.helpText?.let { text -> @Composable { Text(text) } },
                singleLine = true,
                visualTransformation = if (field.isSecret) PasswordVisualTransformation() else VisualTransformation.None,
                keyboardOptions = KeyboardOptions(keyboardType = if (field.isSecret) KeyboardType.Password else KeyboardType.Text),
                modifier = Modifier
                    .fillMaxWidth()
                    .then(if (index == 0) Modifier.focusRequester(firstField) else Modifier),
            )
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(
            onClick = onSubmit,
            enabled = complete && !submitting,
            modifier = Modifier.fillMaxWidth().focusHighlight(),
        ) {
            if (submitting) CircularProgressIndicator(Modifier.padding(end = 8.dp)) else Text(if (provider.connection != null) "Save" else "Connect")
        }
    }
}
