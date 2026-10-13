package com.browserproxy.companion

data class DeviceCredentials(val token: String, val origin: String, val rotateAt: Long)
interface CredentialStore {
    fun load(): DeviceCredentials?
    fun save(value: DeviceCredentials)
    fun clear()
}
/** Never hold the state lock during network I/O. Clear invalidates every in-flight operation. */
class CredentialCoordinator(private val store: CredentialStore) {
    private var generation = 0L
    private var credentials = store.load()
    private var pairing = false
    private var rotation = false
    data class Snapshot(val generation: Long, val credentials: DeviceCredentials?)
    @Synchronized fun snapshot() = Snapshot(generation, credentials)
    @Synchronized fun beginPairing(): Long {
        check(credentials == null && !pairing) { "Forget existing credentials before pairing" }
        pairing = true
        return generation
    }
    @Synchronized fun acceptPairing(expected: Long, value: DeviceCredentials): Boolean {
        if (expected != generation || !pairing) return false
        store.save(value)
        credentials = value
        pairing = false
        generation++
        return true
    }
    @Synchronized fun finishPairing(expected: Long) { if (expected == generation) pairing = false }
    @Synchronized fun beginRotation(expected: Snapshot): Boolean {
        if (expected.generation != generation || expected.credentials != credentials || rotation || credentials == null) return false
        rotation = true
        return true
    }
    @Synchronized fun acceptRotation(expected: Snapshot, token: String, rotateAt: Long): Boolean {
        if (expected.generation != generation || !rotation || credentials == null) return false
        val next = credentials!!.copy(token = token, rotateAt = rotateAt)
        store.save(next)
        credentials = next
        rotation = false
        generation++
        return true
    }
    @Synchronized fun finishRotation(expected: Snapshot) { if (expected.generation == generation) rotation = false }
    @Synchronized fun invalidate(expected: Snapshot): Boolean {
        if (expected.generation != generation) return false
        clear()
        return true
    }
    @Synchronized fun clear() {
        store.clear() // Persistence must succeed before reporting local disconnection.
        credentials = null
        pairing = false
        rotation = false
        generation++
    }
}
