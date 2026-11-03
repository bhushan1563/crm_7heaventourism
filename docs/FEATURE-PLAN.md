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

(Steps 7 to 18 are complete; what else remains is waiting on the client, see above.)

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
