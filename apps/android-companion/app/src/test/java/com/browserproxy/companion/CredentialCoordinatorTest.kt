package com.browserproxy.companion
import org.junit.Test
import org.junit.Assert.*
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class CredentialCoordinatorTest {
    class Store(var value: DeviceCredentials? = null): CredentialStore {
        var fail = false
        override fun load() = value
        override fun save(value: DeviceCredentials) { check(!fail); this.value = value }
        override fun clear() { check(!fail); value = null }
    }
    private val initial = DeviceCredentials("original", "https://api.example", 7)
    @Test fun clearWinsAgainstInFlightRotation() {
        val store = Store(initial); val state = CredentialCoordinator(store)
        val started = CountDownLatch(1); val response = CountDownLatch(1); val accepted = AtomicBoolean(true)
        val worker = Thread {
            val snapshot = state.snapshot(); assertTrue(state.beginRotation(snapshot)); started.countDown()
            assertTrue(response.await(5, TimeUnit.SECONDS))
            accepted.set(state.acceptRotation(snapshot, "new-token", 14))
        }
        worker.start(); assertTrue(started.await(5, TimeUnit.SECONDS)); state.clear(); response.countDown(); worker.join(5000)
        assertFalse(worker.isAlive); assertFalse(accepted.get()); assertNull(store.value); assertNull(state.snapshot().credentials)
    }
    @Test fun cancelledPairingCannotRestoreCredentials() {
        val store=Store();val state=CredentialCoordinator(store);val generation=state.beginPairing()
        state.clear();assertFalse(state.acceptPairing(generation,initial));assertNull(store.value)
    }
    @Test fun staleRevocationCannotClearNewPairing() {
        val store=Store(initial);val state=CredentialCoordinator(store);val old=state.snapshot()
        state.clear();val pairing=state.beginPairing();assertTrue(state.acceptPairing(pairing,initial.copy(token="replacement")))
        assertFalse(state.invalidate(old));assertEquals("replacement",store.value?.token)
    }
    @Test fun onlyOneRotationCanCommitAndRestartRecoversIt() {
        val store=Store(initial);val state=CredentialCoordinator(store);val snapshot=state.snapshot()
        assertTrue(state.beginRotation(snapshot));assertFalse(state.beginRotation(snapshot))
        assertTrue(state.acceptRotation(snapshot,"rotated",21));assertFalse(state.acceptRotation(snapshot,"replay",28))
        assertEquals("rotated",CredentialCoordinator(store).snapshot().credentials?.token)
    }
    @Test fun lostRotationResponseRecoversByRePairing() {
        val state=CredentialCoordinator(Store(initial));val snapshot=state.snapshot()
        assertTrue(state.beginRotation(snapshot));state.finishRotation(snapshot)
        // Server rotated but response was lost. The following authenticated request receives 401.
        assertTrue(state.invalidate(snapshot));assertNull(state.snapshot().credentials)
        val pairing=state.beginPairing();assertTrue(state.acceptPairing(pairing,initial.copy(token="repaired")))
    }
    @Test fun failedPersistenceNeverReportsSuccessfulClearingOrRotation() {
        val store=Store(initial);val state=CredentialCoordinator(store);store.fail=true
        try {state.clear();fail("Expected disk failure")}catch(_:IllegalStateException){}
        assertEquals(initial,state.snapshot().credentials)
        val snapshot=state.snapshot();assertTrue(state.beginRotation(snapshot))
        try{state.acceptRotation(snapshot,"new",21);fail("Expected disk failure")}catch(_:IllegalStateException){}
        assertEquals(initial,state.snapshot().credentials)
    }
    @Test fun failedRegistrationCanBeRetriedWithoutStaleAcceptance() {
        val state=CredentialCoordinator(Store());val first=state.beginPairing();state.finishPairing(first)
        state.clear();val second=state.beginPairing();assertFalse(state.acceptPairing(first,initial));assertTrue(state.acceptPairing(second,initial))
    }
}
