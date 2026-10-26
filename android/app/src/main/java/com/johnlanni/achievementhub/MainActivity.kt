package com.johnlanni.achievementhub

import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.johnlanni.achievementhub.ui.AchievementHubRoot
import com.johnlanni.achievementhub.ui.theme.AchievementHubTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as AchievementHubApp).container
        setContent {
            AchievementHubTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    AchievementHubRoot(container)
                }
            }
        }
    }

    /**
     * Controller support. Compose already moves focus with the D-pad and
     * Android turns an unhandled B into Back; these mappings cover the rest:
     * A selects (as D-pad center), L1/R1 scroll a page (as Page Up/Down).
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val mapped = when (event.keyCode) {
            KeyEvent.KEYCODE_BUTTON_A -> KeyEvent.KEYCODE_DPAD_CENTER
            KeyEvent.KEYCODE_BUTTON_L1 -> KeyEvent.KEYCODE_PAGE_UP
            KeyEvent.KEYCODE_BUTTON_R1 -> KeyEvent.KEYCODE_PAGE_DOWN
            else -> return super.dispatchKeyEvent(event)
        }
        return super.dispatchKeyEvent(
            KeyEvent(
                event.downTime, event.eventTime, event.action, mapped, event.repeatCount,
                event.metaState, event.deviceId, event.scanCode, event.flags, event.source,
            ),
        )
    }
}
