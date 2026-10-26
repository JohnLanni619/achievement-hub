package com.johnlanni.achievementhub.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Locale

/** JSON shapes here match what server/src/routes/connections.ts returns. */
class ModelsTest {
    @Before
    fun useUsLocale() {
        Locale.setDefault(Locale.US)
    }

    @Test
    fun `decodes the provider catalog`() {
        val json = """
            {"providers":[
              {"id":"retroachievements","name":"RetroAchievements","description":"Classic games",
               "homepage":"https://retroachievements.org","connectInstructions":"Copy your key",
               "credentialFields":[
                 {"name":"username","label":"Username","type":"text","placeholder":"Your username"},
                 {"name":"apiKey","label":"Web API key","type":"password","helpText":"In settings"}],
               "connection":{"id":3,"providerId":"retroachievements","externalId":"ULID","displayName":"TestPlayer","connectedAt":"2026-10-01T10:00:00Z"}},
              {"id":"demo","name":"Demo Provider","credentialFields":[],"connection":null}
            ]}
        """
        val providers = AppJson.decodeFromString(ProvidersResponse.serializer(), json).providers
        assertEquals(2, providers.size)
        assertEquals("TestPlayer", providers[0].connection?.displayName)
        assertTrue(providers[0].credentialFields[1].isSecret)
        assertEquals("Your username", providers[0].credentialFields[0].placeholder)
        assertNull(providers[1].connection)
    }

    @Test
    fun `stat values accept strings and numbers`() {
        val json = """
            {"provider":{"id":"retroachievements","name":"RetroAchievements"},
             "profile":{"externalId":"x","displayName":"TestPlayer","stats":[
               {"label":"Hardcore points","value":1234567},
               {"label":"Member since","value":"2013"},
               {"label":"Ratio","value":12.5},
               {"label":"Missing","value":null}]}}
        """
        val stats = AppJson.decodeFromString(ProfileResponse.serializer(), json).profile.stats.map { it.value }
        assertEquals(listOf("1,234,567", "2013", "12.5", ""), stats)
    }

    @Test
    fun `game detail tolerates missing optional fields and unknown keys`() {
        val json = """
            {"game":{"id":"228","title":"Super Mario World","earned":1,"total":2,
              "award":null,"someFutureField":{"nested":true},
              "achievements":[
                {"id":"1","title":"First","description":"Earned one","points":5,"rarity":75,
                 "earned":true,"earnedAt":"2024-05-01T09:00:00.000Z","earnedHardcore":true},
                {"id":"2","title":"Second","earned":false}]}}
        """
        val game = AppJson.decodeFromString(GameResponse.serializer(), json).game
        assertEquals("Super Mario World", game.title)
        assertNull(game.awardKind)
        assertEquals(75.0, game.achievements[0].rarity!!, 0.0)
        assertEquals("", game.achievements[1].description)
        assertNull(game.achievements[1].points)
    }

    @Test
    fun `award strings map to awards, unknown values to null`() {
        assertEquals(Award.Mastered, Award.from("mastered"))
        assertEquals(Award.BeatenSoftcore, Award.from("beaten-softcore"))
        assertNull(Award.from("platinum"))
        assertNull(Award.from(null))
    }
}
