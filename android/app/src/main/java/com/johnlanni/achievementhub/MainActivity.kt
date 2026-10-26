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

    // Controller support. Compose already moves focus with the D-pad and
    // Android turns an unhandled B into Back. Buttons the UI doesn't handle
    // reach onKeyDown/onKeyUp, where these are re-sent as keys it does:
    // A selects (as D-pad center), L1/R1 scroll a page (as Page Up/Down).

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean =
        redispatchControllerKey(event) || super.onKeyDown(keyCode, event)

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean =
        redispatchControllerKey(event) || super.onKeyUp(keyCode, event)

    private fun redispatchControllerKey(event: KeyEvent): Boolean {
        val mapped = CONTROLLER_KEYS[event.keyCode] ?: return false
        return window.decorView.dispatchKeyEvent(
            KeyEvent(
                event.downTime, event.eventTime, event.action, mapped, event.repeatCount,
                event.metaState, event.deviceId, event.scanCode, event.flags, event.source,
            ),
        )
    }

    private companion object {
        val CONTROLLER_KEYS = mapOf(
            KeyEvent.KEYCODE_BUTTON_A to KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_BUTTON_L1 to KeyEvent.KEYCODE_PAGE_UP,
            KeyEvent.KEYCODE_BUTTON_R1 to KeyEvent.KEYCODE_PAGE_DOWN,
        )
    }
}
