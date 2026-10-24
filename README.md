# ♦♠ 4 KO'ZIR: OMON QOLISH (FOUR TRUMPS: SURVIVAL) ♥♣

**4 Ko'zir: Omon Qolish** — shaxsiy ko'zirlar, qat'iy *Podkidnoy* zanjiri, *Izma-iz tarqatish (`6-6-6-5`)* va *Survival (kartalarning 6 dan Tuzgacha o'yindan chiqib ketishi)* mexanikasiga asoslangan strategik karta o'yini (Full-Stack Web MVP v2.0).

---

## 🌟 O'yinning Asosiy Xususiyatlari

1. **Shaxsiy Ko'zirlar (Personal Trumps):**
   - 4 nafar o'yinchi 4 ta mastadan birini tanlaydi: **G'isht (♦)**, **Tabbon (♠)**, **Yurak (♥)**, **Paxta (♣)**.
   - Yerdagi kolodaning eng oxirgi kartasi yopiq turadi — har bir o'yinchining o'z mastasi o'zi uchun ko'zir hisoblanadi.
2. **Kesishtirish (Himoya) Qoidasi:**
   - Boshqa masta bilan hujum qilinsa: shu mastaning kattarog'i bilan **YOKI** shaxsiy ko'ziringiz bilan kesiladi.
   - O'zingizning shaxsiy ko'ziringiz bilan hujum qilinsa: uni **faqat kattaroq o'z ko'ziringiz** bilan kesishingiz mumkin yoki kartani ko'tarasiz.
3. **Podkidnoy va O'rindiqlar Qoidasi:**
   - Yurish soat mili bo'ylab amalga oshiriladi.
   - Himoyalanuvchiga faqat uning **O'ng** va **Chap** tomonidagi o'yinchilar karta tashlay oladi.
   - **To'g'risida (ro'parasida)** o'tirgan o'yinchi umuman karta tashlay olmaydi!
   - O'ngdagi hujumchi «Pas» degandan so'ng navbat Chapdagi o'yinchiga o'tadi va O'ngdagi o'yinchi qayta karta tashlay olmaydi.
4. **Survival Jazo (6 ➔ Tuz):**
   - Har bir raundda yutqazgan o'yinchining shaxsiy ko'ziri kichigidan boshlab (**6, 7, 8, 9, 10, Valet, Dama, Qirol, Tuz**) o'yindan butunlay chiqarib yuboriladi.
   - Barcha 9 ta ko'zirini yo'qotgan o'yinchi turnirdan chetlatiladi.
5. **Izma-iz Tarqatish (`6-6-6-5 ➔ 6-6-5-5 ➔ 6-5-5-5 ➔ 5-5-5-5`):**
   - Kartalar o'yindan chiqib kamayishi natijasida diler kartalarni bitta-bittadan aylantirib tarqatadi (masalan, 13 ta karta chiqib 23 ta qolganda `6-6-6-5`, 22 ta qolganda `6-6-5-5`, 21 ta qolganda `6-5-5-5`, 20 ta qolganda `5-5-5-5`).

---

## 🚀 Ishga Tushirish (Backend + Frontend)

```bash
# Serverni ishga tushirish (Port 3000)
npm start
# Yoki:
node server.js
```

Brauzerda ochish: **[http://localhost:3000](http://localhost:3000)**  
Windowsda tezkor ishga tushirish uchun **`START_GAME.bat`** faylini ikki marta bosing.

---

## 📂 Loyiha Tuzilishi

- `index.html` — Asosiy o'yin interfeysi (Stol, 4 o'rindiq, Simulyator, Reyting va Qoidalar modal oynalari)
- `css/style.css` — Royal Casino 3D-perspective dizayn va animatsiyalar
- `js/cards.js` — 36 talik koloda va SVG qirollik kartalari (Valet, Dama, Qirol, Tuz) generatori
- `js/engine.js` — O'yin qoidalari va holat mashinasi (Isomorphic: Browser + Node.js)
- `js/ai.js` — 3 ta bot uchun taktik Sun'iy Intellekt dvijogi
- `js/audio.js` — Web Audio API ovoz effektlari sintezatori
- `js/ui.js` — Interaktiv UI, zarralar (particle FX) va Backend API mijozi
- `server.js` — Node.js REST API Backend server va doimiy ma'lumotlar bazasi (`data/database.json`)
- `TEXNIK_TOPSHIRIQ_KARTA_OYINI.docx` — Rasmiy Texnik Topshiriq (TZ / GDD) hujjati
