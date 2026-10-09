# Cursusbeheer (canvastool) — project brief voor Cursor

Lokaal draaiende webapp voor docenten: Canvas-cursussen beheren (secties, groepen) en cijfers/opdrachten **alleen bekijken**. Token blijft op de machine; geen multi-user SaaS.

Gebruik dit document bij een **herstart** van het project: plak relevante delen in Cursor Rules, of verwijs ernaar in de eerste prompt (“bou volgens `docs/project-brief.md`”).

---

## Persona

**JP — docent**, gebruikt Canvas LMS, wil bulk-acties sneller dan in Canvas UI, vooral secties/groepen. Werkt vaak op Windows; app draait lokaal via Docker.

---

## User stories

### Verbinding & cursussen

- **US-01** Als docent wil ik zien met welk Canvas-account en welke host ik verbonden ben, zodat ik weet welke data ik zie.
- **US-02** Als docent wil ik mijn cursussen (als teacher) zien met code, periode, term en status, zodat ik snel de juiste cursus kies.
- **US-03** Als docent wil ik **lopende** en **afgeronde** cursussen gescheiden zien, zodat oude cursussen niet in de weg zitten.
- **US-04** Als docent wil ik cursussen als **favoriet** markeren die bovenaan blijven, zodat mijn vaste cursussen één klik zijn (lokaal per account in de browser).

### Studenten

- **US-05** Als docent wil ik alle studenten in een cursus zoeken (naam, e-mail, SIS, sectie, groep), zodat ik iemand snel vind.
- **US-06** Als docent wil ik studenten **vanuit de studentenlijst** aan een sectie of groep koppelen (en omgekeerd), zodat ik niet eerst ergens anders hoef te selecteren.
- **US-07** Als docent wil ik meerdere studenten selecteren en in één keer aan sectie/groep toewijzen, zodat bulk aan het begin van het semester snel gaat.

### Secties

- **US-08** Als docent wil ik secties aanmaken en studenten in een sectie plaatsen, zodat groepen/klassen in Canvas kloppen.
- **US-09** Als docent wil ik per sectie studenten **zoeken en toevoegen** achter een knop, zodat het scherm niet vol staat met formulieren.
- **US-10** Als docent wil ik vóór plaatsen een **bevestiging** zien (conclude op oude sectie-inschrijving), zodat ik weet wat Canvas doet; cijfers blijven staan.

### Groepen

- **US-11** Als docent wil ik groepsets en groepen aanmaken en studenten toevoegen/verwijderen, zodat projectgroepen beheerbaar zijn.
- **US-12** Als docent wil ik leden per groep achter “Leden (n)” zien, niet permanent open, zodat lange groepslijsten leesbaar blijven.

### Opdrachten & cijfers (read-only)

- **US-13** Als docent wil ik opdrachten per cursus zien en per opdracht inzendingen/scores bekijken, **zonder** dat de app cijfers naar Canvas schrijft.
- **US-14** Als docent wil ik een cursus-breed cijferoverzicht (huidig/eind, %) naast de opdrachtenlijst, zodat ik voortgang kan scannen.

### UX & performance

- **US-15** Als docent wil ik een **rustige, consistente** UI (dashboard-stijl, warm accent, acties achter knoppen), zodat het geen “technisch formulier” voelt.
- **US-16** Als docent wil ik dat **studenten- en cursusdata gecached** worden en op de achtergrond verversen, zodat tab-wisselen snel is; na wijzigingen moet data wel weer kloppen.
- **US-17** Als docent wil ik na bulk-acties een **resultaat per student** (ok / overgeslagen / fout), zodat ik zie wat misging.

### Later / backlog (nog niet verplicht bij rebuild)

- Filters op cursuslijst (status, term) + filter onthouden (`localStorage`).
- “Alles verversen”-knop (begin semester).
- Selectiebalk met snelkoppelingen naar Secties/Groepen.
- Donker thema (optioneel).

---

## Niet-doelen

- Geen publieke hosting of multi-tenant auth.
- Geen cijfers schrijven naar Canvas (read-only voor grades/assignments).
- Geen vervanging van volledige Canvas UI.

---

## Tech stack (eenvoudig)

| Laag | Keuze |
|------|--------|
| **Runtime** | Docker Compose, één service, poort `127.0.0.1:8320` → container `8080` |
| **Backend** | Python 3.12, **FastAPI**, **uvicorn**, **httpx** → Canvas REST API |
| **Frontend** | **React 19**, **TypeScript**, **Vite 6**, **react-router-dom** |
| **Deploy** | Multi-stage Dockerfile: `npm run build` → static files served by FastAPI |
| **Config** | `.env`: `CANVAS_BASE_URL`, `CANVAS_API_TOKEN` |
| **Tests** | pytest (backend), minimaal Canvas-client/helpers |

Geen Redux, geen aparte DB: Canvas is source of truth; browser **sessionStorage/memory cache** voor GET-responses.

---

## Architectuur (kort)

```
Browser (React SPA)
    ↓ fetch /api/*
FastAPI (BFF)
    ↓ HTTPS + token
Canvas LMS API
```

- **Routers**: `meta` (/api/me), `courses`, `sections`, `groups`, `grades` (assignments + read-only grades).
- **operations.py**: Canvas-calls + domeinlogica (bulk place section, group members, course list active/past).
- **Frontend**: pages per tab; gedeelde UI (`ui.tsx`), cache (`apiCache.ts`), course-scoped selection (`sessionStorage`).

---

## Belangrijke productregels

1. **Sectie plaatsen**: nieuwe enrollment in doelsectie; andere student-enrollments in cursus → `conclude` (cijfers blijven).
2. **Groep plaatsen**: student uit andere groep in **dezelfde groepset** eerst eruit.
3. **Cache**: stale-while-revalidate; na **POST** mutatie → `invalidateCourse(courseId)` + reload betrokken endpoints. Studenten/cursussen: lange TTL (~30–60 min); cijfers korter (~10 min).
4. **Taal UI**: Nederlands; code/comments: Engels.
5. **Layout**: course sidebar (Studenten, Secties, Groepen, Opdrachten); home = cursuslijst met favorieten.

---

## Canvas API (indicatief)

- Lijst teacher courses: `GET /api/v1/courses` (active + completed enrollments, `include[]=term`).
- Studenten: course users + enrollments, secties, group categories/groups.
- Schrijven: `POST` section enrollments, `DELETE` enrollments `task=conclude`, group memberships.

Token moet rechten hebben die de acties toestaan (o.a. **manage sections** waar nodig).

---

## Lokaal starten (doel)

```powershell
# .env invullen vanuit .env.example
docker compose up --build
# http://127.0.0.1:8320
```

Frontend dev (optioneel): proxy naar backend in `vite.config.ts`.

---

## Cursor tips bij rebuild

1. Begin met **backend**: config, Canvas client, `/api/me`, `/api/courses`, dan students + één write-flow (sectie).
2. Daarna **frontend shell**: router, course layout, home + students table.
3. Voeg **manage-pages** toe (secties/groepen) met het patroon: `ManageActionButton` + `ManagePanel`.
4. Pas **cache** pas toe als GET-paden stabiel zijn.
5. Houd user stories als checklist; implementeer US-01 t/m US-10 vóór polish (favorieten, cache tuning).

---

## Visuele richting (vastgelegd)

- **Instrument/dashboard**: donkere topbar + course-rail, licht contentvlak.
- **Accent**: warm oranje/terracotta; groen alleen voor succes (verbonden, ok-resultaten).
- **Dichtheid**: balanced (niet te compact, niet te luchtig); tabellen scanbaar.

---

*Laatste update: gebaseerd op canvastool MVP in repo; gebruik als single source of truth bij herstart.*
