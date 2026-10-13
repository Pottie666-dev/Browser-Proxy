package com.browserproxy.companion
import org.junit.Test
import org.junit.Assert.*
class ApiOriginTest {
 @Test fun trustedHttpsOrigin(){assertEquals("https://api.example:8443",ApiOrigin.validate(" https://api.example:8443/ "))}
 @Test fun rejectsCredentialLeakDestinations(){for(url in listOf("http://api.example","https://user:password@api.example","https://api.example/path","https://api.example?redirect=evil","https://api.example#token","file:///tmp/api","https://api.example:99999")){try{ApiOrigin.validate(url);fail("Accepted unsafe origin: $url")}catch(_:IllegalArgumentException){}}}
}
