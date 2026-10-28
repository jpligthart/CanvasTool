# Cursusbeheer (canvastool)

Lokale webapp voor docenten: Canvas-cursussen beheren (secties, groepen) en cijfers/opdrachten **alleen bekijken**.

## Starten

1. Kopieer `.env.example` naar `.env` en vul minstens `CANVAS_BASE_URL` en `CANVAS_API_TOKEN` in.
   Optioneel: `CANVASTOOL_IMAGE` (registry/repo zonder tag) — nodig voor image-naam in compose en voor releases.
2. Start met Docker:

```powershell
docker compose up --build -d
```

Lokaal krijg je image-tag **`local`**; de app-versie in de UI komt nog steeds uit het bestand **`VERSION`** in de image.

3. Open http://127.0.0.1:8321

Productie (`docker-scripts/canvastool`, image `:latest`) blijft op http://127.0.0.1:8320, container `canvastool`. Lokaal gebruikt poort **8321** en container `canvastool-dev`, zodat die twee elkaar niet in de weg zitten.

## Versie & Docker release

**Dagelijks lokaal:** `docker compose up --build` — geen release-script nodig.

**Release naar je registry** (multi-arch `linux/amd64` + `linux/arm64`, tags `:VERSION` + `:latest`):

1. Bump **`VERSION`** handmatig (bijv. `0.1.0`) — het script doet dat **niet**. Die waarde gaat naar UI, `/api/health` en de image-tags.
2. Zet `CANVASTOOL_IMAGE` in `.env` (of in de shell), bijv. `my.registry/org/canvastool`.
3. Push:

```powershell
pwsh ./scripts/build-and-push.ps1
```

Alleen native arch lokaal bouwen, zonder push:

```powershell
pwsh ./scripts/build-and-push.ps1 -SkipPush
```

## Frontend development (optioneel)

```powershell
cd frontend
npm install
npm run dev
```

Vite proxyt `/api` naar `http://127.0.0.1:8321` — de lokale backend moet dan ook draaien.

## Tests

```powershell
pip install -r requirements.txt
pytest
```
