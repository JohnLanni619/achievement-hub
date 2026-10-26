package com.johnlanni.achievementhub.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.input.InputMode
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalInputModeManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.johnlanni.achievementhub.data.ApiException
import com.johnlanni.achievementhub.data.Award
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
fun ErrorBox(
    error: ApiException,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
    extraAction: (@Composable () -> Unit)? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.errorContainer,
        shape = RoundedCornerShape(12.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(error.message, color = MaterialTheme.colorScheme.onErrorContainer)
            if (onRetry != null) Button(onClick = onRetry) { Text("Retry") }
            extraAction?.invoke()
        }
    }
}

/** Achievement progress: softcore fill underneath, hardcore fill on top (same as the web app). */
@Composable
fun ProgressBar(earned: Int, total: Int, hardcore: Int?, modifier: Modifier = Modifier) {
    val fraction = if (total > 0) (earned.toFloat() / total).coerceIn(0f, 1f) else 0f
    val hardcoreFraction = if (total > 0 && hardcore != null) (hardcore.toFloat() / total).coerceIn(0f, 1f) else null
    val color = MaterialTheme.colorScheme.primary
    Box(
        modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(50))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(fraction).background(color.copy(alpha = 0.45f)))
        if (hardcoreFraction != null) Box(Modifier.fillMaxHeight().fillMaxWidth(hardcoreFraction).background(color))
    }
}

@Composable
fun AwardChip(award: Award?, modifier: Modifier = Modifier) {
    if (award == null) return
    val color = when (award) {
        Award.Mastered -> MaterialTheme.colorScheme.tertiary
        Award.Completed -> MaterialTheme.colorScheme.primary
        Award.Beaten, Award.BeatenSoftcore -> MaterialTheme.colorScheme.secondary
    }
    Text(
        award.label,
        modifier = modifier
            .border(1.dp, color, RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 2.dp),
        color = color,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
    )
}

/** A network image, or a neutral placeholder when there's no URL. */
@Composable
fun RemoteImage(
    url: String?,
    size: Dp,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(8.dp),
    dimmed: Boolean = false,
) {
    val base = modifier
        .size(size)
        .clip(shape)
        .background(MaterialTheme.colorScheme.surfaceVariant)
        .alpha(if (dimmed) 0.6f else 1f)
    if (url == null) {
        Box(base)
    } else {
        AsyncImage(model = url, contentDescription = null, modifier = base, contentScale = ContentScale.Crop)
    }
}

/**
 * A thick accent border while focused, so controller and keyboard users can
 * see where they are. Put it *before* the clickable/focusable modifier.
 */
fun Modifier.focusHighlight(shape: Shape = RoundedCornerShape(12.dp)): Modifier = composed {
    var focused by remember { mutableStateOf(false) }
    val color = MaterialTheme.colorScheme.primary
    this
        .onFocusChanged { focused = it.isFocused }
        .then(if (focused) Modifier.border(3.dp, color, shape) else Modifier)
}

/**
 * Focuses the returned requester's item once [trigger] is non-null, but only
 * when the user is navigating with a D-pad or keyboard, so touch users never
 * see a stray focus ring.
 */
@Composable
fun rememberInitialFocus(trigger: Any?): FocusRequester {
    val requester = remember { FocusRequester() }
    val inputModeManager = LocalInputModeManager.current
    LaunchedEffect(trigger) {
        if (trigger != null && inputModeManager.inputMode == InputMode.Keyboard) {
            withFrameNanos { } // let the item attach first
            runCatching { requester.requestFocus() }
        }
    }
    return requester
}

/** Page Up/Down (which MainActivity maps from the L1/R1 shoulder buttons) scroll a list by a screen. */
fun Modifier.pageScrollKeys(state: LazyListState, scope: CoroutineScope): Modifier = onPreviewKeyEvent { event ->
    if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
    val direction = when (event.key) {
        Key.PageDown -> 1f
        Key.PageUp -> -1f
        else -> return@onPreviewKeyEvent false
    }
    scope.launch { state.animateScrollBy(direction * state.layoutInfo.viewportSize.height * 0.8f) }
    true
}
