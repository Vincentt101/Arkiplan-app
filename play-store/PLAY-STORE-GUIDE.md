# ArkiPlan – Google Play release guide

Everything in this folder is ready to upload:

| File | What it is |
|---|---|
| `ArkiPlan-1.0-release.aab` | The app bundle to upload (version 1.0, code 1, targets Android 16 / API 36) |
| `play-icon-512.png` | Store icon 512 × 512 |
| `play-feature-graphic-1024x500.png` | Feature graphic 1024 × 500 |
| `privacy-policy.html` | Privacy policy – must be put online (step 3) |
| `KEEP-PRIVATE-signing-key/` | Upload key + password. **Never share it. Keep a second backup (USB / another drive).** Every future update must be signed with it. |

---

## 1. Create your Google Play developer account
1. Go to https://play.google.com/console and sign in with the Google account that will own the app.
2. Choose **Yourself** (personal account), pay the one-time **US$25** fee, and complete **identity verification** (valid ID; it can take a few days).
3. In **Settings › Payments profile**, set up your **merchant / payments profile** (bank account for payouts, tax info). This is required to sell subscriptions.

> New personal accounts must run a **closed test with at least 12 testers for 14 days** before Google lets you publish to everyone. Plan for this: ask 12+ friends/classmates with Android phones to join the test (step 6).

## 2. Create the app
**Home › Create app**
- App name: **ArkiPlan – House Plans PH**
- Default language: English (United States)
- App or game: **App** · Free or paid: **Free** (money comes from the subscription)
- Accept the declarations.

## 3. Put the privacy policy online
Play needs a public web address. Easiest free option:
1. Open `privacy-policy.html`, replace **[your contact e-mail]** with your e-mail.
2. Create a page at https://sites.google.com (New site › paste the text) and **Publish** – or use GitHub Pages.
3. Copy the page URL into **Policy › App content › Privacy policy**.

## 4. App content (Policy › App content)
- **Ads:** No, the app does not contain ads.
- **App access:** All functionality available without special access (no login).
- **Content rating:** fill the questionnaire → category *Utility / Productivity*, answer **No** to violence, sexual content, gambling, user-generated content → rating "Everyone".
- **Target audience:** 18 and over.
- **Data safety:**
  - Does your app collect or share user data? **No** (projects stay on the device; purchases are handled by Google Play).
  - Is data encrypted in transit? **Yes**.
  - Can users request data deletion? Data is only on the device – uninstall/clear data deletes it.
- **Government app / Financial features / Health:** No.

## 5. Store listing (Grow › Store presence › Main store listing)
**App name (30):** ArkiPlan – House Plans PH

**Short description (80):**
Draw house plans and get a full Philippine building permit plan set as PDF.

**Full description:**
```
ArkiPlan turns room sizes into a complete building-permit plan set – right on your phone or tablet.

Enter your rooms, doors and windows and ArkiPlan builds the rest:
• Floor plans with walls, grid lines, columns and dimensions
• Roof plan, roof framing and truss details
• Front, rear and side elevations and building sections
• T&B details, schedule of finishes, doors & windows schedule
• Foundation, beam plans, footing, column and beam details, stair detail
• Electrical: lighting & power layouts, schedule of loads (PEC), riser diagram
• Plumbing: sanitary, storm drainage and waterline layouts, isometrics, septic tank
• Lot plan from the technical description, site development plan, vicinity map
• Bill of materials & cost estimate with labor – Philippine prices, editable
• Title block in the Philippine permit format (Office of the Building Official)

Export the whole set as PDF, or DXF for AutoCAD. Works offline – your projects stay on your device.

FREE 7-DAY TRIAL – every feature unlocked.
After the trial, drawing and previews stay free; downloading PDF, DXF and the bill of materials needs ArkiPlan Pro (monthly subscription, cancel anytime in Google Play).

Plans are a design aid – permit drawings must be checked and signed by a licensed architect / engineer.
Developed by Darvin.
```
- **App icon:** `play-icon-512.png` · **Feature graphic:** `play-feature-graphic-1024x500.png`
- **Phone screenshots (2–8, required):** take them on a phone/emulator with a project open – Plan tab, Sheets tab (a floor plan sheet), 3D view, the BOM preview. Tablet screenshots (7" and 10") are recommended because the app is used on tablets.
- **Category:** House & Home · **Contact e-mail:** your e-mail.

## 6. Upload a test release
1. **Test and release › Testing › Closed testing › Create track** (or use **Internal testing** first for yourself).
2. **Create new release** → Play App Signing: **Use Google-generated key** (recommended) → upload `ArkiPlan-1.0-release.aab`.
3. Release name `1.0`, release notes: *First release.*
4. **Testers:** create an e-mail list with your testers (12+ for closed testing) and share the opt-in link.

## 7. Create the subscription (Monetize › Products › Subscriptions)
*(available after the first upload is accepted and the payments profile is done)*
1. **Create subscription** – Product ID: **`arkiplan_pro_monthly`** (must be exactly this) · Name: *ArkiPlan Pro*.
2. Benefits: "Download PDF plan sets", "Bill of materials PDF", "DXF for AutoCAD".
3. **Add base plan** – Base plan ID: **`monthly`** (exactly) · Auto-renewing · Billing period **1 month** · Grace period 7 days.
4. **Price:** Philippines **₱899.00**, then "Update prices" to let Google convert for other countries (or limit availability to the Philippines).
5. **Activate** the base plan.
6. *(Optional)* Don't add a Google Play free-trial offer – the app already gives 7 days free without signing up.

## 8. Test the purchase
1. **Setup › License testing** – add your Gmail (and testers). License testers are not charged.
2. Install the app from the **testing opt-in link** (a sideloaded APK cannot buy subscriptions).
3. To test the locked state quickly: Android **Settings › Apps › ArkiPlan › Storage › Clear data** does not end the trial (it restarts it) – to test the paywall, wait for the trial or ask me for a test build with a 0-day trial.
4. Tap Download PDF after the trial → **Subscribe** → Google Play sheet → test card → "Welcome to ArkiPlan Pro!".

## 9. Go live
After 14 days of closed testing with 12+ testers: **Dashboard › Apply for production** → answer the questions → Google reviews (a few days). Then **Production › Create release** → promote the tested release → roll out.

## Future updates
Ask me to make changes, then I raise `versionCode` (2, 3, …), build a new `.aab` signed with the same upload key, and you upload it under **Production › Create new release**.

## Money
Google keeps **15 %** of subscription revenue (for the first US$1M per year), you get 85 %, paid monthly to the bank account in your payments profile once you pass the payout threshold.
