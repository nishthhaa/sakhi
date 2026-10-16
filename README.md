# Sakhi — personal safety companion

A working women's-safety web app. No build step, no framework, no backend. Open the folder, host it over https, and every feature below runs on a real phone.

---

## Run it (choose one)

**Fastest — GitHub Pages**
1. Create a repo, upload every file keeping the folder structure.
2. Settings → Pages → Branch `main`, folder `/root` → Save.
3. Open the `https://…github.io/…` link on your phone and allow location.
4. On Chrome Android: menu → *Add to home screen*. It installs like an app.

**Local testing**
```bash
cd sakhi
python3 -m http.server 8080
# then open http://localhost:8080
```
`localhost` counts as a secure origin, so GPS works there too.

**Do not just double-click index.html.** Chrome refuses GPS on `file://` pages. The app will tell you this on screen instead of silently failing.

---

## Why the location actually works

`navigator.geolocation.watchPosition` runs continuously with `enableHighAccuracy`, so every alert is built from the newest fix rather than a cached one. The coordinates go into three places: a `https://maps.google.com/?q=lat,lng` link, a reverse-geocoded street address from OpenStreetMap, and the raw numbers with the accuracy radius in metres.

Delivery uses the phone's own apps, which is what keeps it unblockable:

| Channel | How | Needs internet |
|---|---|---|
| WhatsApp | `https://wa.me/<number>?text=<message>` — the chat opens with the text already typed | Yes |
| SMS | `sms:+91…,+91…?body=<message>` — every guardian on one message | No |
| Call | `tel:+91…` | No |

No CORS, no API key, no paid SMS gateway, nothing a network can block.

---

## What's on each page

**Home** — Hold the SOS dial for two seconds (a ring fills so you can't fire it by accident). It refreshes GPS, opens the alert sheet, sounds the siren, and while the alert is live it re-fetches your position every few minutes so you can send an updated pin. Four quick tiles: send location, siren + strobe, fake call, record audio. Three hands-free triggers below: shake the phone three times, a microphone that fires the alert on a sustained scream, and rolling location updates.

**Safe walk** — Type a destination and how long it should take. Guardians get a "journey started" message with the destination, the vehicle number and your starting pin. A countdown runs; miss it and the app fires the alert on its own with your last known position. Extend by ten minutes or mark yourself arrived. It logs a breadcrumb trail and total distance, exportable as CSV.

**Guardians** — Contacts with country code, relation, and an "alert first" flag that reorders everyone. A Test button sends a harmless message so you can confirm the number is right before you ever need it.

**Evidence locker** — Audio recording that keeps running while you use the rest of the app, plus a rear-camera snapshot for a number plate or a face. Every item is stamped with time and place and can be downloaded. It stays in memory and never leaves the device.

**Marked spots** — Pin a place that felt unsafe with a reason. Come within 300 metres of it again and a banner warns you, calculated with the haversine formula against your live position.

**Helplines** — Real Indian numbers (112, 1091, 181, 1098, 108, 15100, 1930), tap to dial, plus four rights worth knowing — Zero FIR, the night-arrest rule, free legal aid, and giving your statement at home.

**Settings** — Your alert message is a template: `{name} {time} {maps} {address} {accuracy} {battery}`. Choose which channels appear, how often location refreshes, and set your stealth codes.

**Stealth mode** — The eye icon in the header hides everything behind a working iOS-style calculator. Type your unlock code and press `=` to come back. Type the panic code and `=` and it fires the alert without the siren. You can also make the app open in the calculator every time.

---

## Files

```
index.html                all views and overlays
css/styles.css            plum-night theme, mobile first, desktop rail
js/store.js               storage with a memory fallback, shared state
js/location.js            GPS watch, reverse geocoding, haversine
js/alerts.js              message templating, WhatsApp/SMS/call, siren
js/features.js            fake call, recorder, camera, scream, shake, walk, zones, calculator
js/app.js                 routing, SOS flow, rendering, wiring
sw.js                     offline shell
manifest.webmanifest      installable as an app
```

---

## Honest limits

- **You press send.** Browsers cannot dispatch a WhatsApp or SMS message without a tap — that restriction exists so no page can spam from your number. The app removes every step except that one: the recipient is chosen, the message is typed, the location is fresh. If you need genuinely automatic sending, add a backend with Twilio or the WhatsApp Business API and post to it from `Alerts.openSheet`.
- **A "live" link needs a server.** The map links are pins at a moment in time. The app compensates by re-fetching your position on a timer and offering the new pin. Continuous tracking needs somewhere to store positions.
- **Background limits.** Alerts and timers run while the tab is open. Installing it to the home screen keeps it alive much longer than a browser tab.
- **Address lookup needs internet.** OpenStreetMap's free endpoint is rate-limited and polite-use only. Coordinates and map links work offline; only the street name is skipped.
- **Data is local.** Clearing browser data erases your guardians. Export a backup from Settings.
