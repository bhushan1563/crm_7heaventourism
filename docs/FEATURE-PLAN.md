# Feature plan: client update (hotels, itineraries, visa, land service, confirmation)

Living document. Each item is ticked only after it passed its checks (see *Definition of done*).
Scope decisions so far: **mobile app is out of scope for now** (source code is not available); **photos are stored in MongoDB Atlas**.

## 1. Requirements and acceptance criteria

The client's text was re-read twice; where it is ambiguous the interpretation is stated and must be confirmed with the client.

| # | Client requirement | Acceptance criteria (what "done" means) | Interpretation / open point |
|---|---|---|---|
| R1 | Quotation -> **Confirmation** (new info to be added on conversion) | A confirmed quotation can be converted to a Confirmation record pre-filled from the quotation; list, edit, PDF; the quotation is locked and the guest status updates. | **Client will supply the extra fields later.** Build the conversion + a flexible field area first, add their fields when received. |
| R2 | **Hotel list**: saved forever, searchable, photos, quotation straight from a hotel, different hotel quotation format | Hotels menu with search + filters; add/edit with photo gallery; hotels are archived, never destroyed; "Create quotation" on a hotel; the Hotel quotation type picks its hotel from the list (with quick "Add hotel"); a distinct hotel quotation layout (PDF + preview). | "Included" = available in the list and in quotations. Sample hotel quotation requested from client. |
| R3 | **Visa quotation**: documents checklist, pricing, others; all editable | New quotation type "Visa" with editable checklist, pricing lines, notes/terms; own layout. | Optional per-country templates. |
| R4 | **Land service quotation**: vehicle only, with itinerary and pricing, vehicle type, vehicle inclusions | New type "Land Service" with vehicle type (editable list), inclusions (editable checklist), itinerary, pricing; own layout. | |
| R5 | **Itineraries with photos**, saved per destination, **Word and PDF**, reusable in quotation / confirmation / land service with changes | Itinerary library (search, photos per day); export to .docx and PDF with photos; "insert into quotation" copies it (editing the copy never alters the library original). | Word sample requested from client. |
| R6 | Quotation: **multiple hotel options and pricing structure** | A quotation can hold several options (e.g. A/B/C), each with hotels and its own pricing, shown side by side; old quotations keep working. | **Needs a real example from the client.** |
| R7 | Mobile app update | **Deferred** (source not available). | Revisit when the React Native project is provided. |
| R8 | **Rights** update | New modules appear in the Rights screen and are enforced by the API; sensible defaults per role. | Per quotation-type visibility is a possible extension: confirm. |
| R9 | **Font size, highlight, bold colour** in quotations | Formatting toolbar in quotation text (itinerary, notes, lists); visible in preview, PDF and Word; safe (cannot inject code). | |
| R10 | Misc | Collected into a list and planned when the client sends it. | |

## 2. Architecture decisions

1. **Photos in Atlas** (collection `media`): the browser resizes each photo (full <= 1600 px, thumbnail <= 400 px, JPEG/WebP) before upload; the server validates the real file signature and size, de-duplicates by SHA-256, and enforces a storage quota (`MEDIA_QUOTA_MB`, default 350 of the 512 MB free tier) with a clear message. Photos are served from unguessable URLs (`/media/<token>`, long-lived cache) so they work in `<img>`, in PDFs and in Word export. List APIs never return image bytes. An orphan clean-up command removes unreferenced photos.
2. **Rich text** = a small, whitelisted HTML subset (bold, italic, underline, lists, colour, highlight, font size), produced by a TipTap editor and **sanitised on the server** (never trusted from the client). Old plain-text values keep working.
3. **Rights**: one list of modules (single source of truth), new modules `hotels`, `itineraries` (later `confirmations`); role defaults defined in one place and used by both the API and the Rights screen.
4. **API conventions kept** (the web app depends on them): business errors are HTTP 200 + `{ success:false, message }`, auth failures are 401. New list endpoints are **paginated**, return only needed fields (`lean`, projections), use indexes, escape search terms, and allow-list updatable fields.
5. **Additive data changes only**: new collections / optional fields with defaults; existing quotations, guests and users are never rewritten.
6. **No new heavy libraries in the first page load**: editor and Word export are lazy-loaded.

## 3. Build order and checklist

### Step 0: Foundations
- [x] 0.1 Rights: single module list; add `hotels`, `itineraries`; role defaults; Rights screen shows them; record-ownership mapping
- [x] 0.2 Media service in Atlas: model, upload, serve, quota, dedupe, usage, orphan clean-up
- [x] 0.3 Rich-text sanitiser (server) + client renderer
- [x] 0.4 UI building blocks: photo uploader (client resize, progress, errors), rich-text editor, photo gallery/lightbox
- [x] 0.5 Test infrastructure: property-based tests, in-memory-database integration tests in CI

### Step 1: Itinerary library (R5, part of R9)
- [x] 1.1 Model + API (CRUD, duplicate, archive, search, pagination) with rights
- [x] 1.2 Library screens (list, search, editor with day-wise photos and formatting)
- [x] 1.3 Export to Word (.docx) and PDF with photos
- [x] 1.4 Insert a saved itinerary into a quotation (copy, editable); photos + formatting render in the quotation preview/PDF

### Step 2: Hotel list and hotel quotation (R2)
- [x] 2.1 Model + API + photos + search
- [x] 2.2 Hotels screens
- [x] 2.3 Hotel quotation type driven by the list (+ quick add) and its layout
- [x] 2.4 "Create quotation" from a hotel; pick-from-list inside package hotel stays

### Step 3: Quotation upgrade (R6, rest of R9)
- [x] 3.1 Multiple hotel options with pricing per option (backward compatible)
- [x] 3.2 Formatting toolbar everywhere text is entered in a quotation

### Step 4: Land service (R4)
- [x] 4.1 "Land Service" quotation type (vehicle only): vehicles with type, seats, AC, quantity and rate (the price is the vehicle table), trip details, vehicle inclusions (formattable), itinerary (including copy from the library), own tabs and print layout; the amount shown in lists follows the vehicle total
### Step 5: Visa (R3)
- [x] 5.1 "Visa" quotation type: the visa (country, type, entry, how issued, validity, stay, processing time, applicants), a documents checklist (starts empty because it depends on the country; one click adds a standard checklist to edit), fees charged per applicant or once for the whole group (the price is the fee table; the amount shown in lists follows its total), visa inclusions, price note, all formattable; own tabs (no itinerary, hotels or flights) and print layout
### Step 6: Confirmation (R1)
The client's own list of extra fields has not arrived, so this is a first version built to take them later. Decisions:
- A **Confirmation is its own record**: a frozen copy of the quotation as it was sold (itinerary, hotels, prices, terms) plus the booking information added when converting. If the quotation offered hotel options, the option the client accepted is chosen at conversion and becomes the hotels and price of the confirmation.
- **Booking information**: travellers (name, age, passport), payment (total, received, balance due date, note; the balance is always calculated), notes (formattable), and an **Additional details** area (label + value pairs) for whatever the client adds to their list; fields can be promoted to fixed ones once the list is known.
- **Locking**: converting locks the quotation for everyone (including Admin) and sets its status and the guest's status to Confirmed. Cancelling the confirmation (with a reason) unlocks the quotation and restores both statuses. To change the trip itself: cancel, edit the quotation, confirm again (a new confirmation number).
- Confirmations are cancelled, never deleted; one live confirmation per quotation (enforced by the database, so two people clicking at once cannot create two).
- [x] 6.1 Model, rights module `confirmations`, API: convert (atomic, with the chosen option), list (search, status, pages), read, update booking information (concurrency check), cancel
- [x] 6.2 Quotation lock (update, delete, duplicate reset) and guest status follow-up, including "fully paid" moving the guest on; a lock left behind by a request that died half-way is released by itself
- [x] 6.3 Screens: Confirmations list and editor, "Confirm booking" on the quotation list, locked banner on the quotation
- [x] 6.4 Confirmation document: booking page followed by the quotation pages, in preview, PDF and print
### Step 7: Rights pass (R8), misc (R10)
- [x] 7.1 Formatting everywhere (R9, completed): the price line and pricing notes, room allocation, flight ticket note, end-of-tour banner, hotel option price notes, vehicle notes, land service and visa price notes can all be formatted (size, bold, colour, highlight) in the editor, are cleaned on the server and print with their formatting. A price line that was written or formatted by hand is no longer overwritten when the price changes. Names, dates, numbers and the quotation title stay plain on purpose (they are used in lists, search and file names)
- [x] 7.2 Every route audited by a test that reads the real routers: each is signed-in and guarded by the right module and the right action; confirming a booking also needs read access to quotations
- [x] 7.3 The Download right is honoured everywhere a PDF or print can be made (preview windows, builder Print buttons, booking preview), not only on the list's download button
- [x] 7.3b The Rights screen shows what people really have (their own rights, else their role's, else the built-in default), not only the rows someone had saved. Before, it drew Quotations, Hotels, Itineraries and Bookings as "off" for people with nothing saved for them, and saving the screen would have taken that access away
- [x] 7.4 `docs/RIGHTS.md`: what each right means, the built-in defaults per role (generated from the code, checked by a test), the lock rules and the open points
- [ ] 7.5 R10 (miscellaneous requests): waiting for the client's list; per quotation type visibility (R8 extension) waiting for the client's answer

Open for Step 6 once the client sends their list: promote the fields they name from "Additional details" to fixed fields (and decide whether Viewers should see passport numbers: by default every role can read, as for the other modules; an Admin can change that on the Rights screen).

### Step 8: From the client's sheet and the team (added 2026-11-03)
- [x] 8.1 Hotel quotation PRICING table (R6, the client's sheet): per option (Option 1, Option 2 ... up to 6, each nameable, copyable) rows Adult / Extra bed / CWB / CNB (more rows can be added) with Package, Airfare, Visa and TCS per person, Total, PAX and Final Price (Total x PAX), and a Grand Total. Entered on the Pricing tab, printed as the sheet (an option with nothing entered is not printed), shown in the quotation list as the lowest Grand Total, and confirming a booking asks which option the client accepted. Hotel quotations that already have the older per-person price list keep it, with a button to switch
- [x] 8.2 Admin can reset anyone's password (Reset password button in User Management: strong password generator, shown once, copy button; the person is signed out everywhere). One password rule for creating, editing and resetting (8 to 72 characters, no outer spaces, not the email). Checked for the team's addresses typed with capitals and stray spaces, deactivation, and what each role can do
- [x] 8.3 Visa list (sidebar "Visas", like Hotels): saved visas (country, type, entry, how issued, validity, stay, processing time, documents checklist, usual fees, inclusions, price note, internal notes) that can be archived, never duplicated, and used in two ways: "Create quotation" on a visa, or "Choose from the visa list" inside a visa quotation (asks before replacing anything typed). Own rights module (Visa List): Sales and Ops can work on it out of the box, never delete
- [x] 8.4 Pricing tables on the hotel itself: built, then REMOVED again on 2026-11-04 at the user's request (prices change, so the hotel list keeps only what a hotel offers and rates are entered in each quotation; see step 10). The hotel API and form no longer carry pricing tables

### Step 9: Visa quotations in the Visas section, and sending them (added 2026-11-03, from the client call and the user's message)
Already there and not touched: the client name, duration / nights, pax breakdown and travel date on the first tab of a visa quotation; the Visa & Documents tab filled from the Visa List; the Visa List in the sidebar.
- [x] 9.1 The printed visa quotation (PDF and the preview) shows who it is for and when: client, travellers, travel date, duration and "valid until", in a box before the visa facts. Nothing is printed that was not typed, and a visa quotation no longer starts with a made-up duration or guests ("3 Nights / 4 Days", "3 Adults" stay for other types)
- [x] 9.2 Visas > Client visas: every visa quotation, found by destination, country, kind of visa, client, number, phone or e-mail (the Japan package is not mixed in). Each row: Preview, PDF, Word, Send, Edit (locked when confirmed). "New visa quotation" opens the builder already set to Visa. A saved visa quotation lands here
- [x] 9.3 Word (.docx) of a visa quotation: real Word tables, lists and formatting, so it can be edited, with the same content as the PDF plus the terms and policies
- [x] 9.4 Send to the client: choose PDF or Word, edit the message, then WhatsApp or e-mail. With no WhatsApp number (or e-mail) the window asks for one, checks it in plain words (+91 added to ten-digit numbers) and offers to keep it on the quotation where the person may change it. Honest limit: a WhatsApp or e-mail link cannot carry a file, so the file is saved first and the window says to attach it; where the browser can share files, "Share the file with an app" attaches it directly. Sending the file automatically needs a mail service and the WhatsApp Business API (not set up)
- [x] 9.5 "Save to the Visa List" on the Visa & Documents tab: keeps the visa, checklist, fees and inclusions (never the client or the trip) so it can be picked next time; a visa already in the list is not added twice
- [ ] 9.6 Waiting on the client: bulk import of visa documents (they said they would give PDFs or CSV); the same send/download from a saved visa without a client

### Step 10: Hotel quotations: options and the usual price list (added 2026-11-04, from the user's message with three screenshots)
- [x] 10.1 The Hotels page has no Pricing section any more (rates change, so they are entered in each quotation; Rooms and meals stayed then and was removed in step 12)
- [x] 10.2 A new hotel quotation starts with Option 1 and Option 2 (the 3 star and the 4 star choice shown side by side in one quotation). Each option takes several hotels from the hotel list (for example two 3 star and three 4 star), has its own name and its own price per person, and its total is counted from the guests. "Create quotation" on a hotel puts that hotel first in Option 1. "Back to a single offer" is still there for a one-hotel quotation
- [x] 10.3 Pricing tab: the usual per-person price list (Package Price, Airfare, Other, Add On, totals counted for the guests) is the same for hotel and package quotations. The sheet-style pricing tables are no longer offered for new quotations; a quotation already priced with them keeps them (they still print) with a button to go back to the usual list
- [ ] 10.4 Open: does the user want the client's sheet layout (Adult / Extra bed / CWB / CNB) back inside each option later? Not built, not asked for now

### Step 11: Send booking confirmations, sender number, tidy quotation list (added 2026-11-04, from the user's message with three screenshots)
- [x] 11.1 Send a booking confirmation to the client from the Confirmations list (button on every confirmed row) and from the booking's own page ("Send to client"): the same window as for visa quotations, as a PDF (the booking page followed by the quotation as it was sold). WhatsApp asks for the number if the booking has none, shows the message to change, then opens the chat for that number with the message ready; e-mail the same with an address and a subject. A typed number or address is kept on the booking (where the person may change it; saving carries the version seen, so it never overwrites a colleague's save). Honest limit as before: the chat or mail cannot carry the file, so it is saved first and the window says to attach it
- [x] 11.2 Sender number: an Admin sets, per person, the number their messages to clients carry, in Rights & Security (one box for the chosen person; refused numbers are explained). It closes the message in the Send windows (the company number when the person has none) and the window shows it. Needs the right to change rights (an Admin always has it); a person cannot set their own through the profile. WhatsApp itself still sends from the account signed in on the device
- [x] 11.3 Quotation list alignment: the action icons keep seven fixed places (a confirmed or locked row used to sit 15px off the others), the columns fit a laptop (1366px) without sideways scrolling, the quotation number and the status are never cut, rows are one even height, long names show in full on hover. The Confirmations and Client visas lists keep their buttons on one line too
- [ ] 11.4 Open: Word file of a booking confirmation (only PDF today); sending the file itself automatically (needs a mail service and the WhatsApp Business API)

### Step 12: Hotel form without "Rooms and meals" (added 2026-11-04, from the user's message with one screenshot)
- [x] 12.1 The "Rooms and meals" section (room types, "Add a room type", "Meal plans offered") is gone from the Add / Edit hotel form. The form no longer sends `roomTypes` or `mealPlans`; the server leaves what a request does not mention as it was, so a hotel that already has them keeps them (checked on a real database and in a browser), and a new hotel simply starts with none. Rooms are typed in each quotation.
- [x] 12.2 A hotel that already has saved rooms and meal plans still offers them when it is picked into a quotation (room suggestions, first room and meal plan filled in); a hotel without them is used just the same, with the room typed by hand
- [x] 12.3 The "N room types" count is removed from the hotel cards and from the hotel picker (it would say "0 room types" on every new hotel). The server still sends the count; nothing shows it
- [ ] 12.4 Not done on purpose: the stored `roomTypes` / `mealPlans` fields and the server rules for them stay, so nothing already saved is lost and the mobile app keeps working. They can be removed later with a data clean-up once the user is sure they are not wanted

### Steps 13 to 17: the client's hotel and booking messages of 3 Nov 2026 (added 2026-11-04; the user asked for them one by one, not in one)
Source: the client's WhatsApp chat (pricing sheet image "Per room Per Night / No of Nights / No Of Rooms / Total" with rows 2 Adults, Extra bed, Child With bed, Child No Bed and a Grand Total; "for Package format: based on per person cost"; "keep optional for Extra bed, Child with bed and Child No bed"; the 12:30 and 12:31 messages; the 12:55 list for confirmations; "Master Editor for Notes and Policy"; "Dollar symbol to Rupee symbol") and the user's note that the hotel Option 1 / Option 2 print looks plain and must look professional.

### Step 13: Hotel quotation layout: the destination on top, then the hotel with its room and address, then the dates
- [x] 13.1 On top of a hotel quotation: the DESTINATION (the city), not the hotel name. A hotel quotation made from a hotel now starts with the hotel's city as its destination (it used to start with the hotel's own name, which is why the print said "TAJ LAKE PALACE" on top); picking the first hotel into an empty hotel quotation fills the city the same way. Quotations already made are not changed
- [x] 13.2 Under it, each hotel: the hotel name, then its room category, then its address (the order the client asked for; the city is not repeated when the address already has it)
- [x] 13.3 Under the hotel details: check-in and check-out date, written the way the client wrote it ("Check In: 07 Mar 2026", "Check Out: 10 Mar 2026"); a date that was not entered is left out
- [x] 13.4 The same on the printed Option cards and on the single-hotel print (the PDF is made from the same page)
- [x] 13.5 The hotels inside an option can now be given what the print shows: Check-in date, Check-out date, No. of rooms and the address (before, an option's hotel had no boxes for these). The nights follow the two dates once both are entered (and can still be changed by hand); a check-out that is not after the check-in is refused in plain words, naming the option and the hotel

### Step 14: Hotel rates in the client's table, for 3 star and 4 star options with several hotels each
- [x] 14.1 Under each hotel of each option: the client's table, columns Per room per night, No of nights, No of rooms, Total; the first row is the room for 2 adults; Extra bed, Child with bed and Child no bed are optional rows (added with a button, left out when not needed). Nights and rooms start from the stay (grey), can be changed per row; every total is counted, never typed. A hotel picked into a hotel quotation arrives with its room row ready
- [x] 14.2 The Grand Total of an option is the sum of its hotels; it is stored as the option's total (the server counts it itself and ignores a typed one), so the booking total, the confirm window and the list keep working. The price per person of such an option is only that total shared by the guests. A package quotation keeps the price per person (the client: "for Package format, based on per person cost"). An older hotel option with only a price per person keeps it, with a button to move to the table
- [x] 14.3 Options print as a professional proposal: a dark header per option (OPTION 1, its name, a "Recommended" ribbon), each hotel with its room, address, dates and its table, a Hotel total when there are extra rows, and a Grand Total bar. Each hotel is its own block so the PDF continues a long option on the next page without splitting a table (checked on the real 3-page PDF). A confirmed booking prints the same tables and "Grand Total"
- [x] 14.4 The server checks the table (kind, label, rate, nights, rooms, limits) in plain words, naming the hotel and the row; the browser and the server use the same file for the figures (a test keeps the two copies identical and a property test compares them)

### Step 15: Booking confirmation: what the client asked to add once a quotation turns into a confirmation (hotel and package)
- [x] 15.1 The vehicle notes ("Points to be Noted (Vehicle Note)") are left out of a confirmation (the quotation behind it keeps them)
- [x] 15.2 Hotel confirmation number below the hotel name: entered on the booking page, in a new "Hotels" section with one block for each hotel of the booking (hotel confirmation number, hotel contact number, check-in time, check-out time), saved with the booking (`hotelBookings`, checked in plain words by the server); printed only when entered
- [x] 15.3 Hotel contact number after the address (it starts from the hotel list's number and can be changed for this booking)
- [x] 15.4 Check In and Check Out time after the dates: "Check In: 07 Mar 2026, Time: 14:00" and "Check Out: 10 Mar 2026, Time: 11:00" (the times start from the hotel list's usual times); "Time: ____" is printed to write in when no time is known; the separate "Timings" line is not printed on a confirmation
- [x] 15.5 "Confirmation Details" below the destination name: a heading on the booking page (with the confirmation number added to the details) and a line "Confirmation Details: 7H-CF-… • Confirmed on …" under the destination on the pages of the quotation copy ("CANCELLED" is added for a cancelled booking)
- [x] 15.6 All of this is the same for hotel and package confirmations; a quotation (before it is confirmed) prints exactly as it did

### Step 16: Master editor for Notes and Policy
- [x] 16.1 The Master Editor: a screen "Notes & Policies" (Administration, for Admins) where the standard Notes and Policy text is changed once instead of quotation by quotation: five lists (important notes & terms, payment policy, cancellation policy, exclusions, vehicle notes), each line formatted text, with add, remove and move. Saved on the server as one record (`/api/master-text`); until something is saved the built-in text (as before) is used, and "Back to the built-in text" removes the saved record after asking
- [x] 16.2 A NEW quotation starts with the saved text, only in a list nobody has typed in; "Reset Default" on a quotation's payment and cancellation policy goes back to it. A quotation that was already made keeps its own text (checked on a real database and in the browser), so what a client was sent never changes
- [x] 16.3 Everyone who reads quotations can read it; only people with the update right on rights (Admins) can change it. Another person who opens the address sees it read-only with a plain note; the server refuses their save. Two Admins editing at once: the second save is refused with "Load the latest version". Formatted text is cleaned on the server like every other quotation list
- [ ] 16.4 Open: the same editor for the other standard texts (inclusions, the end-of-tour banner) if the client wants them; not asked for now

### Step 17: Rupee symbol
- [x] 17.1 Every dollar sign in the interface is now a rupee: the icons on the Dashboard card ("Confirmed & Paid"), the quotation list card and the "5. Pricing" tab (the guest list's unused dollar icon import was removed). Amounts are written "Rs 1,00,000" (Indian grouping) everywhere; the whole source is searched for dollar icons, "$" amounts, USD and US number formats, and a test keeps it that way

### Step 18: Paste a copied picture into any photo gallery (added 2026-11-04, from the user's message with the "Photos of the destination" screenshot)
- [x] 18.1 In every photo gallery (itinerary, hotel, quotation days): copy a picture on Google or any page (right-click, "Copy image") or take a screenshot, point at the gallery (or click inside it) and press Ctrl+V. The picture is prepared and uploaded like any chosen photo, named "Pasted photo 1.png" (a real file name is kept). Tested with the real clipboard in a real browser
- [x] 18.2 A "Paste a picture" tile next to "Add photos" for people who do not know the shortcut (asks the browser for what was copied; if the browser will not allow it, says to click once and press Ctrl+V), and a tip line under the gallery
- [x] 18.3 Also taken: a picture copied together with its web page, a copied picture address (even without ".jpg" at the end, fetched when the site allows it, with a "Getting the picture…" tile), and a picture dragged from a web page onto the box. Other kinds of picture (GIF, AVIF, BMP) are converted to PNG
- [x] 18.4 Plain words when it cannot work: no picture in what was copied, a site that does not allow copying (what to do instead), a link that is not a picture, the gallery full. Ordinary text is never taken: pasting words, or text into a caption box, behaves as before. A page with several galleries (the days of an itinerary) pastes only into the one the pointer or keyboard is on

- [x] 18.5 Phone layout (from the user's phone screenshot): the "Paste a picture" tile stuck out past the dashed box. The two-column grid now lets its columns shrink, the tiles wrap their text, the message icon sits on its first line, and the caption hint is shorter. Checked in a real browser at 390, 360 and 320 px (touch, dark) with and without photos, and on the computer layout. A phone has no Ctrl+V, so it shows "touch and hold it, then Copy image, then tap Paste a picture", and the messages no longer say "right-click" or "Ctrl+V" only
- [x] 18.6 Found while checking on the phone and fixed: two or three uploads that finish almost together could silently lose one photo (a stale copy of the list overwrote a newer one). The gallery now keeps building on the newest list it made. A test reproduces the loss (2 of 3 photos) on the old behaviour

### Step 19: Phone layout: the page slid up under the top bar and left a blank band (added 2026-11-04, from the user's phone screenshots of the live site)
- [x] 19.1 On a phone the whole PAGE could scroll, not only the app's content area: the body was 100vh (which counts the area behind the address bar) while the app shell is 100dvh, so the page was taller than the screen. The top bar slid out of view and a blank band (about 50px) was left at the bottom, with the content cut off above it ("stuck" scrolling). While the app is on screen the page itself no longer scrolls (class on the page set by the Layout), and the body is the visible height. Reproduced by modelling the address-bar difference (3 of 12 checks passed before, 12 of 12 after) and checked on 16 screens at 360 px
- [x] 19.2 A second cause on the dashboard: a visually hidden table header (position absolute) deep in the long page had no positioned parent, so it stretched the whole page by 723px. The app shell is now the positioned parent, so nothing hidden can stretch the page
- [x] 19.3 The save bar at the bottom of a form (Back / Create) is lower on a phone (about 83px instead of about 140px: the two buttons share a row) and sits on the bottom edge of the screen instead of floating above it with the form showing through underneath
- [ ] 19.4 Open: the same checks on a real phone by the user (the address-bar behaviour is modelled, not seen on a device)

### Step 20: Pricing in the client's two sheets: "Only Hotel" and "Package" (added 2026-11-04, from the user's message with the two sheet images)
How the message was read: **Only Hotel** is priced with the first sheet (Sr No, Package, Airfare, Visa, TCS, Total, No of Person, Total, rows Adult / Extra bed / CWB / CNB, Grand Total) with "Total" shown as **Final Price** and "No of Person" as **PAX**; **Package** is priced with the second sheet (Per room per night, No of nights, No of rooms, Total, rows For 2 Adults / Extra bed / Child With bed / Child No Bed, Grand Total) in the same cards. Option 1 and Option 2 are the 3 star and the 4 star choice, each with several hotels (Hotel Details tab). This reverses Step 14 (hotels had a rate table each, packages a price per person); quotations made before still open as they were.
- [x] 20.1 Two layouts of one pricing table (`layout: sheet | rooms`): the sheet as before (per person: Package, Airfare, Visa, TCS, PAX; Total and Final Price worked out), and the rooms table (rate per room per night, nights, rooms; the Total of a row and the Grand Total worked out). Nights left empty follow the length of the trip ("4 Nights / 5 Days" gives 4), rooms left empty are one. Only the typed figures are stored; the maths is one shared file on both sides (`roomTables.js`, a test checks the two are identical).
- [x] 20.2 A new Only Hotel or Package quotation starts with Option 1 and Option 2 in the right layout; options can be added (up to 6), renamed, copied and removed; same cards, same buttons in both layouts. A quotation that still has the per-person price list is offered "Use the pricing table" (and back), asking before anything typed is removed.
- [x] 20.3 Hotel Details: each option holds several hotels (dates, rooms, address) and no longer has its own price box or rate table when the pricing tables carry the prices; it points to the Pricing tab. Saving no longer asks for a price per person in that case (`optionsProblem`). Server: tables are validated in plain words (a nights or rooms value that is not a whole number, a rate that is not an amount, a nameless row), the quotation's list price follows the lowest filled option ("From Rs X").
- [x] 20.4 Print / PDF: the PRICING box with the sheet (hotel) or the rooms table (package), only options with something entered; the option cards show the hotels only, with "the price of each option is in the pricing table below". The quotation list shows the lowest Grand Total and "From, 2 options".
- [x] 20.5 Confirming: a booking keeps only the accepted option's hotels and its pricing table. When the hotel options and the pricing options line up (Option 2 with Option 2) the dialog asks one question and shows each option's Grand Total; the server also takes the pricing option in the same place when none is named. A confirmation no longer says "Option 1 · Option 1".
- [x] 20.6 Checked in a real browser at desktop, laptop, tablet and phone widths (the room table's long headings wrap instead of running into each other); the printed pricing of both layouts; the whole flow: create, save, print, confirm.
- [ ] 20.7 Open: the user's decision on whether the hotel options and the pricing options should share one name (today each is named where it is edited)

### Step 21: "A new version is available" after an update (added 2026-11-04, from the user's screenshot of the live Visa List)
- [x] 21.1 Cause: a browser tab left open across an update still asks for the old screen files, which an update deletes, so opening a screen not yet loaded failed and the error screen asked for a manual reload.
- [x] 21.2 Now the page reloads itself once, then opens the screen (`lazyWithReload`, used for every screen). If the reload does not help (a file really gone, no network) it shows the same message instead of reloading again and again (at most one automatic reload per 30 seconds, remembered in the tab; nothing happens when the browser blocks that memory). The stylesheet failure ("Unable to preload CSS") that a real update produces is recognised too.
- [x] 21.3 A request for a file under /assets that does not exist is now a plain 404 instead of the home page's HTML.
- [x] 21.4 Checked in a real browser with a simulated update (every file renamed): the tab reloads once and opens the Visa list; with the file really gone it reloads once, shows the message and stops.

### Step 22: "Find hotel info": read a hotel's website and collect its details (added 2026-11-04, from the user's message with the Hotel List screenshot)
What was asked: next to "Add hotel", a "Find hotel info" button opens a page where a hotel website address is pasted; the system reads the site (sitemap, page structure, embedded data) and shows the basics: description, rating, contact, location, rates if shown, amenities, rooms, pictures; with strong validation and plain error messages; fast; download as Word, PDF and CSV; save the find inside the app, in a second section of the Hotel List next to the hotels; a saved find can be edited, downloaded, deleted, and added to the main hotel list through a form where the missing required details are filled in. Tested at every level.
Decisions taken (so the build can go on; each can be changed):
- The reader behaves like a polite visitor, not like a way round a site's protection: an honest user agent, it obeys robots.txt, it does not solve captchas, log in, use disguised browsers or proxies. When a site refuses (robots.txt, 401/403, captcha page, a page drawn only by scripts) the screen says so plainly and offers "Paste the page's text" (the person copies it in their own browser; the same reader then extracts from it).
- It never reaches into the company's own network or the server's: every address (and every redirect, and every address a name resolves to at connection time) is checked; local, private, link-local, cloud-metadata and reserved addresses are refused. Only http/https on the usual ports. Page size, time, redirects, pages per find, and finds per person per hour are capped.
- Rates: only what the hotel's own pages print ("from Rs 7,500 per night", structured price ranges and offers), labelled "as printed on the site, check before quoting". Booking portals are not scraped for prices (their terms forbid it and they block automatic readers); if one of their pages is pasted it is read like any other page and may be refused.
- No headless browser (too heavy for the server): the reader works on the page as delivered, plus the data scripts embed in it (JSON-LD, microdata, OpenGraph, Next/Nuxt state). A site that draws everything with scripts gives less, and says so.
- Pictures: shown through the server (the page's security rules forbid other sites' pictures), only JPEG/PNG/WebP, only addresses the reader itself found (signed, short-lived), and only copied into the app when the person saves, shrunk in the browser exactly like uploaded photos.
- Rights: the `hotels` module (finding needs create, saved finds need read/update/delete, downloads need download).
- [x] 22.1 The safe web reader: address checks, DNS pinned at connect time, redirects re-checked, size/time/redirect caps, compression, content-type, robots.txt, sitemap reading
- [x] 22.2 The extractors (pure, tested on fixture pages): structured data, meta tags, page text (contact, address, rating, times, amenities, rooms, rates), pictures, link ranking
- [x] 22.3 The pipeline: crawl plan and time budget, merging with a source and a confidence for every field, cleaning and validation, completeness score, plain messages for every failure, pasted-text fallback
- [x] 22.4 The API: find, find from pasted text, signed picture proxy, saved finds (list, read, update, delete), rate and concurrency limits, rights, audit tags
- [x] 22.5 The "Find hotel info" page (CRM theme): address box with checks, progress, results with confidence marks, picture picker, edit before saving, Word / PDF / CSV, Save to the app
- [x] 22.6 Hotel List with two sections (Hotels, Found hotels); the saved-find page (view, edit, download, delete); "Add to the hotel list" with a form prefilled from the find and the missing required details asked for
- [x] 22.7 Tests at every level: unit and property-based on the reader and extractors, integration against local pretend hotel sites (redirects, robots, sitemaps, slow, huge, compressed, hostile), scenario tests of the whole flow, interface tests, a real-browser walkthrough; security checks (address tricks, DNS rebinding, redirects to private addresses, decompression bombs)

### Step 23: Visa without the policies page; the confirmation follows its quotation; the finder checked on real sites (added 2026-11-04, from the user's message with the confirmation and visa screenshots)

- [x] 23.1 A visa quotation no longer prints the Terms / Payment policy / Cancellation policy / Exclusions back page, on screen, in print or in the Word file (the client: "This Policy not required in Visa Quotation"). Hotel and package quotations are unchanged.
- [x] 23.2 The confirmation's document shows the booking's own travel date (the one edited on the confirmation page), not the old date of the quotation.
- [x] 23.3 Checked that a confirmed quotation is locked and that cancel, change the quotation, confirm again gives a new booking showing every changed part (travellers, payments and notes belong to the booking, so they start empty again).
- [x] 23.4 Items a to d and the Master Editor for notes and policy were already built and live in Steps 13 to 16 (no vehicle notes; hotel confirmation number under the hotel name; contact number after the address; check-in / check-out time columns; same for Package).
- [x] 23.5 The finder run against real hotel websites. Fixed: a "hotel credit" / voucher / bonus read as the room rate; a postal code from another place shown beside the address; "313 001" not recognised as a postal code; the whole address repeated when a site puts it all in the street line. Sites that refuse robots (403) or have a bad certificate give a plain message and the paste-text way.

### Step 24: Hotel quotation layout improvements and Word export for all types (added 2026-11-04)

- [x] 24.1 Tagline corrected to "Travel with Trust" across the sidebar, all quotation documents (screen and print), Word exports and the default company record. The old value "Travel with the Trust" is gone everywhere.
- [x] 24.2 Only Hotel quotation pricing table: Airfare, Visa and TCS columns removed. The table now shows Sr No, Package, Total, PAX, Final Price only. Grand Total is Package × PAX per row (not the full row sum). The same columns are dropped in the Word export.
- [x] 24.3 For an Only Hotel quotation with options and a pricing table, the table now appears directly below the hotel options (not at the bottom of the page after inclusions), so the client can compare options and prices on the same view.
- [x] 24.4 Word download is now available for all quotation types (Hotel, Package, Visa). The Share / Send dialog shows the Word radio button for every type. The generator for Hotel and Package builds the same sections as the PDF: trip details, hotel options, inclusions, pricing table, itinerary (Package only) and policies.

(Steps 7 to 24 are complete except 19.4 and 20.7; what else remains is waiting on the client, see above.)

## 4. Definition of done (every step)

1. Requirement + acceptance criteria re-read; interpretation confirmed or noted.
2. **Validation and errors**: every field validated on the server with a plain-language message; the screen shows the message next to the problem, never a raw error; network/permission/not-found cases covered.
3. **API quality**: rights enforced, allow-listed fields, indexed queries, pagination, no N+1, no image bytes in lists, request size limits, rate limits where abusable.
4. **UI quality**: consistent with the existing design system; works in light and dark mode and on a phone; keyboard accessible; loading, empty and error states; confirmation before destructive actions.
5. **Tests**: unit tests, **property-based tests** (random/adversarial input), API integration tests against a real (in-memory) MongoDB, browser walk-through of the production build, security/abuse checks. Independent reviewer agents re-check the change.
6. Build and the full test suite pass; no console errors in the browser walk-through.
7. Released through the pipeline; after deploy: health check + read-only smoke check on the live site.

## 5. Release and rollback

Work happens on a branch; a step is merged to `main` (which deploys automatically) only when all checks above are green. Database changes are additive. Rollback = `git revert` of the step's merge commit and push (redeploys the previous behaviour); data written by the new features stays in its own collections.
