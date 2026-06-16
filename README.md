# BearTracker RO 🐻🚨
**Monitorizare prezență urși în timp real - Demo (GitHub Pages)**

Acest proiect este o aplicație web interactivă pentru monitorizarea urșilor, bazată pe alerte oficiale, istoric de căldură (heatmap) și rapoarte comunitare. Această versiune este configurată complet *static* pentru a fi găzduită gratuit și rapid pe GitHub Pages.

## Funcționalități principale

- 🚨 **Alerte RO-ALERT (Simulate)**: Integrează avertizările oficiale pe hartă, localizând mesajele extrase.
- 🗺️ **Zone de Risc (Heatmap)**: Strat vizual colorat, ce marchează zonele cu incidență istorică ridicată.
- 📍 **Crowdsourcing Demo**: Permite utilizatorilor să plaseze un pin manual pe hartă cu raportări detaliate (tipul urmei, observații directe, pagube). *Notă: Pin-urile adăugate manual se salvează strict în LocalStorage-ul dispozitivului în această variantă statică.*

## Tehnologii folosite

- HTML5, CSS3, JavaScript
- **Leaflet.js**: Motorul interactiv de hărți open-source.
- **Leaflet.heat**: Plugin pentru generarea stratului de căldură (heatmap).

## Rulare Locală 🛠️

Deoarece aplicația folosește funcția `fetch` pentru a încărca fișierele de date locale (`alerts.json` și `heatmap.json`), politicile CORS din browserele moderne s-ar putea să o blocheze dacă o rulați doar dând dublu-click pe `index.html`.

Pentru a o rula local, folosiți un server web simplu:
```bash
# Dacă aveți Python instalat
python -m http.server 8000
```
*(Alternativ, puteți utiliza extensia **Live Server** din VS Code).*

## Deployment pe GitHub Pages 🌐
1. Încărcați toate fișierele pe un repository public în GitHub.
2. Din repository, navigați la tab-ul de **Settings** -> **Pages**.
3. La "Build and deployment", la secțiunea *Source*, alegeți **Deploy from a branch**.
4. Selectați branch-ul `main` și salvați. Site-ul dvs. va fi online în câteva minute!
