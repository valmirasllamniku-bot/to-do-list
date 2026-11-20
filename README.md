# Ditari

Aplikacion për lista detyrash me ndërfaqe në shqip. Përdor Node.js (pa paketa shtesë), HTML, CSS, JavaScript dhe SQLite.

## Nisja

1. Instalo Node.js 22.13 ose më të ri.
2. Në këtë dosje ekzekuto `npm start`.
3. Hape [http://127.0.0.1:3000](http://127.0.0.1:3000).
4. Krijo llogari dhe fillo të shtosh detyrat.

Të dhënat aktive ruhen te `data/ditari.sqlite`; databaza nuk përfshihet në Git. Në nisjen e parë, aplikacioni importon automatikisht llogaritë dhe detyrat e vjetra nga `data/database.json`, nëse ekzistojnë. Serveri dëgjon vetëm në kompjuterin lokal. Sesioni ruhet si cookie HttpOnly dhe fjalëkalimet ruhen me scrypt.

## Hapja në telefon pa pagesë

Kompjuteri dhe telefoni duhet të jenë në të njëjtin Wi-Fi. Në kompjuter ndalo serverin normal me `Ctrl+C`, pastaj nise me `npm run start:lan`. Nëse Windows pyet për Firewall, lejo qasjen vetëm në rrjetet private.

Gjej adresën IPv4 të kompjuterit me `ipconfig` në PowerShell (p.sh. `192.168.1.25`) dhe hape në telefon si `http://ADRESA-IP:3000`, për shembull `http://192.168.1.25:3000`. Serveri dhe databaza qëndrojnë në kompjuter; aplikacioni funksionon vetëm kur kompjuteri dhe serveri janë ndezur.

## Teknologjitë

- **Node.js**: serveri HTTP, hyrja në llogari, API-ja dhe ruajtja e të dhënave.
- **HTML/CSS**: faqet dhe pamja e përshtatshme për telefon.
- **JavaScript**: ndërveprimi në faqe dhe komunikimi me API-n.
- **SQLite**: databazë lokale në një skedar, pa server të veçantë ose paketa shtesë.
