package com.johnlanni.achievementhub.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

/**
 * "Sign in with Google" through Android's Credential Manager. Returns a Google
 * ID token addressed to the *web* OAuth client ID, which the Worker verifies
 * (POST /api/auth/google/token). Google matches this app to the Android OAuth
 * client by package name and signing-key SHA-1; see android/README.md.
 */
class GoogleSignIn(private val webClientId: String) {
    sealed interface Result {
        data class Success(val idToken: String) : Result
        data object Cancelled : Result
        data class Failure(val message: String) : Result
    }

    /** [activityContext] must be an Activity: the account picker is shown over it. */
    suspend fun signIn(activityContext: Context): Result {
        val option = GetSignInWithGoogleOption.Builder(webClientId).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val credential = CredentialManager.create(activityContext).getCredential(activityContext, request).credential
            if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                Result.Success(GoogleIdTokenCredential.createFrom(credential.data).idToken)
            } else {
                Result.Failure("Google sign-in returned an unexpected response.")
            }
        } catch (e: GetCredentialCancellationException) {
            Result.Cancelled
        } catch (e: NoCredentialException) {
            Result.Failure("No Google account is available. Add one in Android Settings and try again.")
        } catch (e: GetCredentialException) {
            Result.Failure(e.message ?: "Google sign-in failed. Please try again.")
        } catch (e: GoogleIdTokenParsingException) {
            Result.Failure("Google sign-in returned an unexpected response.")
        }
    }
}
