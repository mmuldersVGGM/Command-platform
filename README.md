# Command Platform v24

Deze versie is opgesplitst in losse bestanden zodat verdere ontwikkeling sneller en stabieler wordt.

## Structuur

- `index.html` — hoofdpagina
- `css/styles.css` — alle vormgeving en adaptieve indeling
- `js/data.js` — veiligheidsregio's en voertuigendatabase
- `js/app.js` — applicatielogica
- `assets/workarea-map.png` — kaart
- `manifest.webmanifest` — PWA-instellingen
- `sw.js` — offline cache
- `icons/` — app-iconen

## Lokaal testen op Windows

Open een terminal in deze map en start bijvoorbeeld:

```bash
python -m http.server 8080
```

Open daarna:

```text
http://localhost:8080
```

## Installeren als app

De PWA-functies werken wanneer de map via HTTPS of localhost wordt aangeboden.

- iPhone/iPad: open in Safari → Deel → Zet op beginscherm
- Android: open in Chrome → menu → App installeren
- Windows: open in Edge/Chrome → App installeren

## Belangrijk voor operationeel gebruik

Plaats deze applicatie in een beveiligde interne omgeving. Inzetgegevens worden in deze versie lokaal in de browser opgeslagen.
