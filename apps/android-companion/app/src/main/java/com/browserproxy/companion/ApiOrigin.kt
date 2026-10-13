package com.browserproxy.companion
import java.net.URI
object ApiOrigin {
 fun validate(value:String):String {
 val uri=URI(value.trim());require(uri.scheme=="https" && uri.host!=null && uri.userInfo==null && uri.query==null && uri.fragment==null && (uri.path.isEmpty()||uri.path=="/") && (uri.port==-1||uri.port in 1..65535)){"Use an HTTPS origin without credentials, path, query or fragment"}
 return value.trim().trimEnd('/')
 }
}
