package com.johnlanni.achievementhub

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiConfigTest {
    @Test
    fun `normalizes pasted URLs to an https origin`() {
        val expected = "https://achievement-hub.example.workers.dev"
        assertEquals(expected, ApiConfig.normalizeBaseUrl("https://achievement-hub.example.workers.dev"))
        assertEquals(expected, ApiConfig.normalizeBaseUrl("achievement-hub.example.workers.dev/"))
        assertEquals(expected, ApiConfig.normalizeBaseUrl("  https://achievement-hub.example.workers.dev/api/ "))
        assertEquals(expected, ApiConfig.normalizeBaseUrl("HTTPS://achievement-hub.example.workers.dev"))
    }

    @Test
    fun `keeps an explicit port`() {
        assertEquals("https://hub.example.com:8443", ApiConfig.normalizeBaseUrl("hub.example.com:8443"))
    }

    @Test
    fun `allows plain http only for local development hosts`() {
        assertEquals("http://10.0.2.2:8787", ApiConfig.normalizeBaseUrl("http://10.0.2.2:8787"))
        assertEquals("http://localhost:5173", ApiConfig.normalizeBaseUrl("http://localhost:5173/"))
        assertNull(ApiConfig.normalizeBaseUrl("http://achievement-hub.example.workers.dev"))
    }

    @Test
    fun `rejects empty and malformed values`() {
        assertNull(ApiConfig.normalizeBaseUrl(""))
        assertNull(ApiConfig.normalizeBaseUrl("   "))
        assertNull(ApiConfig.normalizeBaseUrl("https://"))
        assertNull(ApiConfig.normalizeBaseUrl("https://host/some/path"))
        assertNull(ApiConfig.normalizeBaseUrl("ftp://host"))
        assertNull(ApiConfig.normalizeBaseUrl("not a url"))
    }

    @Test
    fun `is configured only with both values`() {
        assertTrue(ApiConfig("https://a.example", "id").isConfigured)
        assertFalse(ApiConfig(null, "id").isConfigured)
        assertFalse(ApiConfig("https://a.example", null).isConfigured)
    }
}
