# Cursusbeheer (canvastool)

Lokale webapp voor docenten: Canvas-cursussen beheren (secties, groepen) en cijfers/opdrachten **alleen bekijken**.

## Starten

1. Kopieer `.env.example` naar `.env` en vul `CANVAS_BASE_URL` en `CANVAS_API_TOKEN` in.
2. Start met Docker:

```powershell
docker compose up --build
```

3. Open http://127.0.0.1:8320

## Frontend development (optioneel)

```powershell
cd frontend
npm install
npm run dev
```

Vite proxyt `/api` naar `http://127.0.0.1:8320` — backend moet dan ook draaien.

## Tests

```powershell
pip install -r requirements.txt
pytest
```
