package com.johnlanni.achievementhub.data.cache

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert

/**
 * One API response, stored as the JSON it decodes from. Keeping whole
 * responses (rather than a table per type) means new API fields never need a
 * migration; the app only ever loads a response by its key.
 */
@Entity(tableName = "cached_responses", indices = [Index("providerId")])
data class CachedResponse(
    /** e.g. "providers", "games/retroachievements", "game/retroachievements/1234". */
    @PrimaryKey val key: String,
    /** The provider the response belongs to, or null for account-wide data like the providers list. */
    val providerId: String?,
    val json: String,
    /** When it was fetched, in epoch milliseconds. */
    val fetchedAt: Long,
)

@Dao
interface CacheDao {
    @Query("SELECT * FROM cached_responses WHERE `key` = :key")
    suspend fun get(key: String): CachedResponse?

    @Upsert
    suspend fun put(response: CachedResponse)

    @Query("DELETE FROM cached_responses WHERE `key` = :key")
    suspend fun delete(key: String)

    @Query("DELETE FROM cached_responses WHERE providerId = :providerId")
    suspend fun deleteProvider(providerId: String)

    @Query("DELETE FROM cached_responses")
    suspend fun clear()
}

@Database(entities = [CachedResponse::class], version = 1, exportSchema = false)
abstract class CacheDatabase : RoomDatabase() {
    abstract fun cache(): CacheDao

    companion object {
        fun create(context: Context): CacheDatabase =
            Room.databaseBuilder(context, CacheDatabase::class.java, "cache.db")
                // It's only a cache: on a schema change, start empty and refetch.
                .fallbackToDestructiveMigration(dropAllTables = true)
                .build()
    }
}
