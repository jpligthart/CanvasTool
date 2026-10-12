# Cursusbeheer (canvastool)

Lokale webapp voor docenten: Canvas-cursussen beheren (secties, groepen) en cijfers/opdrachten **alleen bekijken**.

## Starten

1. Kopieer `.env.example` naar `.env` en vul `CANVAS_BASE_URL` en `CANVAS_API_TOKEN` in.
2. Start met Docker:

```powershell
docker compose up --build -d
```

Lokaal krijg je image-tag **`local`**; de app-versie in de UI komt nog steeds uit het bestand **`VERSION`** in de image.

3. Open http://127.0.0.1:8321

Productie (`docker-scripts/canvastool`, image `:latest`) blijft op http://127.0.0.1:8320, container `canvastool`. Lokaal gebruikt poort **8321** en container `canvastool-dev`, zodat die twee elkaar niet in de weg zitten.

## Versie & Docker

**Eén bestand:** pas alleen **`VERSION`** aan (bijv. `0.1.0`). Die waarde gaat naar de UI, `/api/health` en de Docker-image-tag.

Bouwen en naar Zot pushen voor **linux/amd64 en linux/arm64** (versie-tag + `latest`):

```powershell
pwsh ./scripts/build-and-push.ps1
```

Alleen bouwen, niet pushen:

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
