# Proxy Engine

## Current Concept

Browser requests are wrapped through the API proxy endpoint.

```text
WebView -> API /api/proxy -> remote website
```

## Desired Future

Every account should have its own proxy/IP assignment.

A proxy profile should include proxy URL, type, username/password, country, city/region, ISP/mobile/residential type, sticky session ID, health status, last checked, latency, and failure count.

## Proxy Matching

The app should warn if proxy country does not match timezone, proxy country does not match geolocation, IP reputation is bad, proxy is datacenter when account expects mobile/residential, latency is too high, or proxy has changed unexpectedly.

## Planned Features

- per-account proxy assignment
- proxy health check
- IP lookup
- timezone/IP mismatch detection
- automatic failover
- sticky sessions
- mobile proxy support
- residential proxy support
- proxy rotation rules
- proxy history per account
