package com.johnlanni.achievementhub.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Holds the Worker session token (sent as `Authorization: Bearer`). */
interface TokenStore {
    /** The current token, or null when signed out. */
    val token: StateFlow<String?>

    /** False until the stored token (if any) has been read at startup. */
    val ready: StateFlow<Boolean>

    suspend fun save(token: String)
    suspend fun clear()
}

/** Token persisted in DataStore, encrypted with a key that never leaves the Android Keystore. */
class SessionStore(
    private val dataStore: DataStore<Preferences>,
    private val cipher: KeystoreCipher,
    scope: CoroutineScope,
) : TokenStore {
    private val _token = MutableStateFlow<String?>(null)
    private val _ready = MutableStateFlow(false)
    override val token: StateFlow<String?> = _token.asStateFlow()
    override val ready: StateFlow<Boolean> = _ready.asStateFlow()

    init {
        scope.launch {
            val stored = dataStore.data.first()[TOKEN_KEY]
            // A token that can't be decrypted (e.g. the key was wiped) just means signed out.
            _token.value = stored?.let { runCatching { cipher.decrypt(it) }.getOrNull() }
            _ready.value = true
        }
    }

    override suspend fun save(token: String) {
        dataStore.edit { it[TOKEN_KEY] = cipher.encrypt(token) }
        _token.value = token
    }

    override suspend fun clear() {
        dataStore.edit { it.remove(TOKEN_KEY) }
        _token.value = null
    }

    private companion object {
        val TOKEN_KEY = stringPreferencesKey("session_token")
    }
}

/** AES-256-GCM with a non-exportable key in the Android Keystore. */
class KeystoreCipher(private val alias: String = "achievement_hub_session") {
    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    fun encrypt(plaintext: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        return encode(cipher.iv) + ":" + encode(ciphertext)
    }

    fun decrypt(payload: String): String {
        val parts = payload.split(":")
        require(parts.size == 2) { "Malformed payload" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, decode(parts[0])))
        return String(cipher.doFinal(decode(parts[1])), Charsets.UTF_8)
    }

    private fun encode(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
    private fun decode(text: String) = Base64.decode(text, Base64.NO_WRAP)

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
