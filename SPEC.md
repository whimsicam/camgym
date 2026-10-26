# CAM Gym — specifica dell'app

Web app da telefono (iPhone, Safari, aggiunta alla schermata Home) per seguire il programma di allenamento e registrare le sessioni. Ospitata su GitHub Pages da questo repo. Lingua dell'interfaccia: italiano. Formati numerici europei (virgola decimale: 42,5 kg).

## Principi

- **Zero build:** HTML, CSS e JavaScript vanilla, file statici. Nessun framework, nessun bundler, nessuna dipendenza npm. Si deve poter aprire `index.html` e funzionare.
- **Il programma non è nel codice.** Tutto ciò che riguarda esercizi, serie, pesi, recuperi e testi viene letto da `programma.json`. Cambiare il programma deve significare cambiare solo quel file.
- **Funziona senza campo.** Tutto si salva prima sul telefono; la sincronizzazione con GitHub avviene quando c'è rete.
- **Veloce da usare con una mano tra una serie e l'altra:** target touch grandi, valori già compilati, un tocco per confermare una serie fatta come previsto.
- **Grafica:** seguire i mockup esportati da Stitch nella cartella `design/` (`home.png`, `sessione.png`, i relativi `.html` e `DESIGN.md`) e la sezione Stile qui sotto. Dai mockup si prende **solo l'aspetto**: esercizi, pesi, testi e numeri mostrati lì sono inventati da Stitch e vanno ignorati; i contenuti arrivano solo da `programma.json` e dai log. Le altre sessioni (Roots, Guns, Wings, Breathe) usano lo stesso layout di Armor.
- I mockup usano Tailwind da CDN e i Material Symbols: nell'app tradurli in CSS semplice con le variabili della palette, senza Tailwind. Icone e disegni a linee come SVG inline. Lo sfondo è `#EBF1E5` (nei file HTML di Stitch compare `#f5fbef`: va sostituito).
- Le diciture decorative dei mockup ("CAM://SYS", "LOG://ACTIVE_SYS", "CALIBRATION…", "REC // LIVE", "MOD_02") si possono tenere come elementi grafici, ma devono mostrare dati veri o essere statiche, mai numeri inventati.

## Stile

Monocromatico, stile "strumento di misura": nessun colore oltre a questa palette, nessuna dark mode.

| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#EBF1E5` | sfondo pagina e card |
| `--surface` | `#E5EAE0` | campi, stato premuto |
| `--ink` | `#292929` | testo, bordi, toggle ON, anelli |
| `--muted` | `#959991` | etichette, testo secondario, valori OFF |
| `--line` | `#B0B8B0` | divisori sottili, anelli vuoti |

- Font: **Space Mono** da Google Fonts (400 e 700), con `font-variant-numeric: tabular-nums` sui numeri. È il font scelto nei mockup di Stitch.
- Card con angoli molto arrotondati (20–24 px) e **bordo da 1 px in `--ink`**, senza ombre né riempimenti colorati.
- Numeri grandi e leggeri (es. `42,5 kg`), etichette piccole in MAIUSCOLO con spaziatura larga sopra i valori.
- Liste come tabelle: righe separate da linee sottili `--line`; la riga attiva/prossima in grassetto.
- Toggle a pillola: ON = pillola `--ink` con scritta "ON" chiara e pallino chiaro; OFF = contorno `--ink` con scritta "OFF".
- Stepper con − e + cerchiati a contorno sottile.
- Ogni sessione ha un piccolo **disegno a linee** (stroke 1 px, solo `--ink`) nella sua card: Armor uno scudo, Roots radici, Guns un manubrio, Wings due ali, Breathe un'onda.
- Indicatori di avanzamento solo come anelli a contorno sottile (nessuna barra colorata).

### Anelli settimanali (Home)
In cima alla home, tre **anelli concentrici** in stile Apple Watch ma monocromatici, tratto sottile (`--line` per la traccia vuota, `--ink` per il pieno, con spessori o tratteggio diversi per distinguerli):
- esterno: **Sessioni** fatte / 4 (Armor, Roots, Guns, Wings) nella settimana lun–dom;
- medio: **Serie** fatte / serie previste dalle 4 sessioni;
- interno: **Cardio** Breathe fatte / 2.
Accanto, la legenda come etichette maiuscole con il valore (es. `SESSIONI 3/4`). Toccando gli anelli si apre lo storico delle ultime 8 settimane come piccoli anelli in fila.
Nella vista Sessione, al posto della progress bar, un solo anello piccolo con la percentuale di esercizi fatti (come il "68%" del riferimento).

## File del repo

```
index.html            app (unica pagina, viste gestite in JS)
app.js, style.css     logica e stile
programma.json        programma in vigore (fonte unica, aggiornata da Claude)
manifest.webmanifest  nome "CAM Gym", display standalone, icone
sw.js                 service worker: cache dei file statici; programma.json network-first
icons/                icone 180/192/512 px
logs/                 una sessione per file, scritti dall'app (non modificarli a mano)
peso/                 pesate corporee, scritte dall'app
report/               resoconti settimanali scritti da Claude
design/               export HTML/PNG di Stitch (solo riferimento visivo)
```

## Viste

### 1. Home
- Card grandi per le sessioni in `programma.json` (`nome` in grande, `focus` piccolo sotto, `durata_min`, data dell'ultima volta fatta). `Breathe` (opzionale) più piccola, in fondo.
- **Prossima sessione evidenziata:** quella che segue l'ultima completata secondo `regole.ordine_sessioni` (circolare). Se nessuna, la prima.
- Banner con `messaggio_coach` se presente; se `fase` è attiva oggi, badge con `fase.tipo` e `fase.nota`.
- Riquadro "Peso di stamattina": input in kg, salva in `peso/AAAA-MM-GG.json`. Mostra la media degli ultimi 7 giorni.
- Contatore "Settimana N" e numero di sessioni fatte nella settimana corrente (lun-dom).
- Icona impostazioni (vedi sotto). Indicatore se ci sono sessioni in attesa di sincronizzazione.

### 2. Sessione
- Header: nome sessione, focus, "COMPLETATO x / y SERIE" con anello piccolo in percentuale, eventuale `nota_sessione`.
- Riga di tre metriche come nel mockup: **VOLUME TOTALE** (somma kg × ripetizioni delle serie spuntate), **DURATA** (dall'apertura della sessione), **RECUPERO MEDIO** (media dei recuperi effettivi tra le serie).
- Una card per esercizio, nell'ordine del JSON. Gli esercizi con lo stesso valore `superset` sono raggruppati in un'unica card con etichetta "Superset" e si alternano serie per serie.
- Contenuto di ogni card:
  - nome; pulsante "Alternativa" che sostituisce l'esercizio con `alternativa` (stesso schema serie/rip/recupero), visibile solo se `alternativa` non è null. Nel log si registra l'id dell'alternativa usata.
  - `cue` in testo attenuato sotto il nome.
  - schema target: "3 × 8–12 · 42,5 kg". Per `carico: "assistito"` mostrare "assistenza 20 kg"; per `corpo_libero` "corpo libero" (o "+X kg" se c'è zavorra); per `unita: "sec"` o `"min"` mostrare secondi/minuti invece di ripetizioni.
  - riga "Ultima volta: 3 × 10, 10, 9 · 40 kg · RIR 2" ricavata dall'ultimo log dello stesso esercizio (stesso id).
  - **una riga per serie**, precompilata con il carico suggerito (vedi Progressione) e `rip_max` come ripetizioni. Per ogni riga: stepper kg (passo = incremento dell'esercizio), stepper ripetizioni, selettore RIR (0, 1, 2, 3, 4+), checkbox "fatta". Se il peso è null, campo vuoto con scritta "calibra".
  - toggle stile iOS "Fatto": si attiva da solo quando tutte le serie sono spuntate, ma si può anche usare a mano (esercizio saltato = toggle spento).
  - campo note libero.
- **Timer di recupero:** quando spunti una serie parte un countdown con il recupero dell'esercizio (`regole.recupero_sec[tipo]`; nei superset `recupero_sec.superset` dopo l'ultimo esercizio del giro, nessun recupero tra i due). Barra in basso fissa, cerchio che si svuota, pulsanti −15 s / +15 s / stop. Il countdown si basa sull'orario di fine salvato (non su setInterval che conta), così resta corretto se Safari va in background. A fine timer: suono breve e flash a schermo.
  - Pulsante "Timer iPhone": apre `shortcuts://run-shortcut?name=Recupero&input=text&text=<secondi>` per avviare il timer nativo, che suona anche a telefono bloccato.
- Pulsante "+ AGGIUNGI ESERCIZIO": aggiunge un esercizio libero (nome, serie, rip, kg) solo per questa sessione, salvato nel log con id `extra-<nome>`. Non modifica il programma.
- Barra di navigazione in basso: HOME e la sessione in corso.
- In fondo: "Chiudi sessione" → schermata con energia 1–5, note generali, durata (calcolata da inizio a fine), poi "Salva".
- La sessione in corso è salvata in localStorage a ogni modifica: se Safari ricarica la pagina, si riprende da dove eri.

### 3. Impostazioni
- Owner, nome repo, branch (default `main`), token GitHub (fine-grained, solo questo repo, permesso Contents read/write). Salvati solo in localStorage, mai nel repo, mai nei log.
- Pulsante "Prova connessione".
- Pulsante "Esporta tutti i dati" (download JSON) come backup.

## Progressione (calcolata dall'app, senza AI)

Per ogni esercizio, in base all'ultimo log con lo stesso id:
- se non esiste log: carico da `peso_kg` del programma;
- se tutte le serie dell'ultimo log hanno raggiunto `rip_max`: carico + `regole.incremento_kg[tipo o carico]` (per `assistito` si **riduce** l'assistenza; per `corpo_libero` si suggerisce zavorra +2,5 kg), con etichetta "↑ sali di peso";
- altrimenti: stesso carico dell'ultima volta;
- durante una `fase` attiva di tipo ripartenza nessun aumento automatico.
Se Claude cambia `peso_kg` in `programma.json` con un `aggiornato` più recente dell'ultimo log, vale il valore del programma.

## Formato dei dati

`logs/AAAA-MM-GG-<idSessione>.json` (se esiste già, aggiungere `-2`):
```json
{
  "data": "2026-11-03",
  "sessione": "armor",
  "versione_programma": "1.0",
  "inizio": "2026-11-03T18:32:00+01:00",
  "fine": "2026-11-03T19:55:00+01:00",
  "energia": 4,
  "note": "",
  "esercizi": [
    {
      "id": "chest-press-inclinata",
      "previsto": "chest-press-inclinata",
      "fatto": true,
      "serie": [ { "kg": 42.5, "rip": 10, "rir": 2 } ],
      "note": ""
    }
  ]
}
```
`peso/AAAA-MM-GG.json`: `{ "data": "2026-11-03", "kg": 68.4 }`

## Sincronizzazione con GitHub
- Al salvataggio la sessione va in una coda in localStorage; l'app prova a scriverla con la GitHub Contents API (PUT `/repos/{owner}/{repo}/contents/logs/...`, messaggio di commit "log: armor 2026-11-03"). Se fallisce resta in coda e riprova all'apertura dell'app e quando torna la rete.
- All'avvio l'app legge `logs/` e `peso/` dal repo (API, con token) e li unisce a quelli locali per avere lo storico completo anche su un altro dispositivo.
- `programma.json` viene letto sempre fresco (no cache). Se `versione` è cambiata rispetto all'ultima vista, mostrare in home "Programma aggiornato" con `messaggio_coach`.

## Criteri di accettazione
1. Su iPhone, aggiunta alla Home, si apre a schermo intero con icona e nome "CAM Gym".
2. Aprire Armor, spuntare tutte le serie del primo esercizio: il timer parte a ogni spunta e il toggle "Fatto" si accende da solo.
3. Ricaricare la pagina a metà sessione: nulla è perso.
4. Salvare in modalità aereo, poi riattivare la rete: il file compare in `logs/` sul repo.
5. Seconda sessione Armor: la riga "Ultima volta" mostra i dati della prima e, se tutte le serie erano a `rip_max`, il carico proposto è salito.
6. Modificare un `peso_kg` o un `cue` in `programma.json` sul repo: dopo il ricaricamento l'app mostra il nuovo valore, senza toccare il codice.
7. Nessun token nel codice o nei file del repo.
