package com.johnlanni.achievementhub

/** Where the app finds the Achievement Hub Worker, from build configuration. */
data class ApiConfig(val baseUrl: String?, val googleWebClientId: String?) {
    val isConfigured: Boolean get() = baseUrl != null && googleWebClientId != null

    companion object {
        /** A hostname (letters, digits, dots, hyphens) with an optional numeric port. */
        private val HOST_AND_PORT = Regex("""([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::(\d{1,5}))?""")

        fun fromBuildConfig() = ApiConfig(
            baseUrl = normalizeBaseUrl(BuildConfig.API_BASE_URL),
            googleWebClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim().ifEmpty { null },
        )

        /**
         * Accepts what people paste ("achievement-hub.x.workers.dev/",
         * "https://…/api") and returns a canonical "https://host" origin, or
         * null if it isn't usable. Plain http is only allowed for local
         * development hosts.
         */
        fun normalizeBaseUrl(raw: String): String? {
            var value = raw.trim().trimEnd('/')
            if (value.isEmpty()) return null
            if (!value.contains("://")) value = "https://$value"
            value = value.removeSuffix("/api").trimEnd('/')

            val scheme = value.substringBefore("://").lowercase()
            val hostAndPort = value.substringAfter("://")
            val match = HOST_AND_PORT.matchEntire(hostAndPort) ?: return null
            val host = match.groupValues[1].lowercase()
            val port = match.groupValues[2]
            val origin = host + if (port.isEmpty()) "" else ":$port"
            val isLocal = host == "localhost" || host == "10.0.2.2" || host == "127.0.0.1"
            return when {
                scheme == "https" -> "https://$origin"
                scheme == "http" && isLocal -> "http://$origin"
                else -> null
            }
        }
    }
}
