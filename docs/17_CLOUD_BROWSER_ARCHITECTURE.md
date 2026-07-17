# Cloud Browser Architecture

```text
Browser-Proxy Mobile App
  ↓ HTTPS
Cloud Session API
  ↓
Session Orchestrator
  ↓
Container Runtime
  ↓
Chromium + Profile Volume
  ↓
Streaming Gateway
```

## Components

- Mobile app creates and controls sessions.
- API authenticates requests and returns signed stream URLs.
- Orchestrator starts and stops containers.
- Each account gets its own profile volume.
- Streaming gateway exposes the browser securely.
