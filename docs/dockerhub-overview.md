# Crucible

Attack simulation and compliance assessment engine with 80+ built-in scenarios, a visual editor, real-time execution, and pass/fail assessment scoring.

Part of the [Inferno Lab](https://github.com/atlas-crew) security testing suite.

## Quick Start

```bash
docker run -p 3000:3000 nickcrew/crucible
```

Open [http://localhost:3000](http://localhost:3000) for the web UI.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `CRUCIBLE_TARGET_URL` | — | Base URL of the system under test |
| `CRUCIBLE_DB_PATH` | `./data/crucible.db` | SQLite database location |
| `CRUCIBLE_REPORTS_DIR` | `./data/reports` | Assessment report output directory |
| `CRUCIBLE_SCENARIOS_DIR` | *(built-in)* | Custom scenarios directory |
| `CRUCIBLE_MAX_CONCURRENCY` | `3` | Max concurrent scenario executions |

### Persist data

```bash
docker run -p 3000:3000 \
  -v crucible-data:/app/data \
  nickcrew/crucible
```

### Point at a target

```bash
docker run -p 3000:3000 \
  -e CRUCIBLE_TARGET_URL=https://api.example.com \
  nickcrew/crucible
```

## Using with Chimera

[Chimera](https://hub.docker.com/r/nickcrew/chimera) provides a high-fidelity vulnerable target with 456+ endpoints across 25+ industries. Crucible's scenario catalog includes attacks designed for Chimera's endpoints.

```bash
docker run -d --name chimera -p 8880:8880 -e DEMO_MODE=full nickcrew/chimera
docker run -d --name crucible -p 3000:3000 \
  -e CRUCIBLE_TARGET_URL=http://host.docker.internal:8880 \
  nickcrew/crucible
```

## Full Security Lab (Compose)

Run all three Inferno Lab products together — Chimera as the vulnerable target, Apparatus as the simulation platform, and Crucible as the assessment engine:

```yaml
services:
  chimera:
    image: nickcrew/chimera
    ports:
      - "8880:8880"
    environment:
      DEMO_MODE: "full"
      APPARATUS_ENABLED: "true"
      APPARATUS_BASE_URL: http://apparatus:8090
    networks:
      - lab

  apparatus:
    image: nickcrew/apparatus
    ports:
      - "8090:8090"
      - "8443:8443"
    environment:
      DEMO_MODE: "true"
    networks:
      - lab

  crucible:
    image: nickcrew/crucible
    ports:
      - "3000:3000"
    environment:
      CRUCIBLE_TARGET_URL: http://chimera:8880
    volumes:
      - crucible-data:/app/data
    networks:
      - lab

networks:
  lab:

volumes:
  crucible-data:
```

```bash
docker compose up -d
```

| Service | URL |
|---------|-----|
| Crucible UI | [localhost:3000](http://localhost:3000) |
| Chimera Portal | [localhost:8880](http://localhost:8880) |
| Chimera Swagger | [localhost:8880/swagger](http://localhost:8880/swagger) |
| Apparatus Dashboard | [localhost:8090/dashboard](http://localhost:8090/dashboard) |

## Also available on npm

```bash
npm install -g @atlascrew/crucible
crucible start
```

## Links

- [Documentation](https://crucible.atlascrew.dev)
- [GitHub](https://github.com/atlas-crew/Crucible)
- [npm](https://www.npmjs.com/package/@atlascrew/crucible)
