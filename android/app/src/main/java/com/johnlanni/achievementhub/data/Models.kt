package com.johnlanni.achievementhub.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.text.NumberFormat

// Mirrors the normalized API shapes in web/src/api.ts and
// server/src/providers/types.ts. Optional fields default to null so new or
// missing fields from the server never break decoding.

/** JSON settings shared by the API client and tests. */
val AppJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}

@Serializable
data class User(
    val id: Long,
    val email: String,
    val displayName: String,
    val avatarUrl: String? = null,
)

@Serializable
data class CredentialField(
    val name: String,
    val label: String,
    val type: String = "text",
    val placeholder: String? = null,
    val helpText: String? = null,
) {
    val isSecret: Boolean get() = type == "password"
}

@Serializable
data class Connection(
    val id: Long,
    val providerId: String,
    val externalId: String,
    val displayName: String,
    val connectedAt: String? = null,
)

@Serializable
data class ProviderInfo(
    val id: String,
    val name: String,
    val description: String = "",
    val homepage: String? = null,
    val connectInstructions: String = "",
    val credentialFields: List<CredentialField> = emptyList(),
)

@Serializable
data class ProviderWithConnection(
    val id: String,
    val name: String,
    val description: String = "",
    val homepage: String? = null,
    val connectInstructions: String = "",
    val credentialFields: List<CredentialField> = emptyList(),
    val connection: Connection? = null,
)

/** A profile stat. The API sends the value as a string or a number; numbers get digit grouping. */
@Serializable
data class Stat(
    val label: String,
    @Serializable(with = StatValueSerializer::class) val value: String,
)

@Serializable
data class Profile(
    val externalId: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val profileUrl: String? = null,
    val motto: String? = null,
    val stats: List<Stat> = emptyList(),
)

/** The highest award on a game, as the API's `award` string. */
enum class Award(val wire: String, val label: String) {
    Mastered("mastered", "Mastered"),
    Completed("completed", "Completed"),
    Beaten("beaten", "Beaten"),
    BeatenSoftcore("beaten-softcore", "Beaten (softcore)"),
    ;

    companion object {
        fun from(wire: String?): Award? = entries.firstOrNull { it.wire == wire }
    }
}

@Serializable
data class GameSummary(
    val id: String,
    val title: String,
    val platform: String? = null,
    val iconUrl: String? = null,
    val earned: Int = 0,
    val total: Int = 0,
    val earnedHardcore: Int? = null,
    val lastEarnedAt: String? = null,
    val award: String? = null,
) {
    val awardKind: Award? get() = Award.from(award)
}

@Serializable
data class Achievement(
    val id: String,
    val title: String,
    val description: String = "",
    val points: Int? = null,
    val badgeUrl: String? = null,
    val lockedBadgeUrl: String? = null,
    /** Percentage (0-100) of the game's players who have earned it. */
    val rarity: Double? = null,
    val type: String? = null,
    val earned: Boolean = false,
    val earnedAt: String? = null,
    val earnedHardcore: Boolean? = null,
)

@Serializable
data class GameDetail(
    val id: String,
    val title: String,
    val platform: String? = null,
    val iconUrl: String? = null,
    val earned: Int = 0,
    val total: Int = 0,
    val earnedHardcore: Int? = null,
    val lastEarnedAt: String? = null,
    val award: String? = null,
    val imageUrl: String? = null,
    val developer: String? = null,
    val publisher: String? = null,
    val genre: String? = null,
    val released: String? = null,
    val totalPoints: Int? = null,
    val achievements: List<Achievement> = emptyList(),
) {
    val awardKind: Award? get() = Award.from(award)
}

@Serializable
data class RecentAchievement(
    val id: String,
    val title: String,
    val description: String = "",
    val points: Int? = null,
    val badgeUrl: String? = null,
    val earnedAt: String? = null,
    val earnedHardcore: Boolean? = null,
    val gameId: String,
    val gameTitle: String,
    val gameIconUrl: String? = null,
    val platform: String? = null,
)

// Response envelopes.

@Serializable data class ProvidersResponse(val providers: List<ProviderWithConnection> = emptyList())
@Serializable data class ProfileResponse(val provider: ProviderInfo, val profile: Profile)
@Serializable data class GamesResponse(val games: List<GameSummary> = emptyList())
@Serializable data class GameResponse(val game: GameDetail)
@Serializable data class RecentResponse(val achievements: List<RecentAchievement> = emptyList())
@Serializable data class ConnectResponse(val connection: Connection)
@Serializable data class MeResponse(val user: User? = null)
@Serializable data class TokenResponse(val token: String, val expiresInSeconds: Long = 0, val user: User)
@Serializable data class ErrorBody(val error: String? = null, val code: String? = null)

object StatValueSerializer : KSerializer<String> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("StatValue", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): String {
        val json = decoder as? JsonDecoder ?: return decoder.decodeString()
        val primitive = json.decodeJsonElement() as? JsonPrimitive ?: return ""
        if (primitive is JsonNull) return ""
        if (primitive.isString) return primitive.content
        val whole = primitive.longOrNull
        return if (whole != null) NumberFormat.getIntegerInstance().format(whole) else primitive.content
    }

    override fun serialize(encoder: Encoder, value: String) = encoder.encodeString(value)
}
