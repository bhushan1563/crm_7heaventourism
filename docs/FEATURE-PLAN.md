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
### Step 6: Confirmation (R1), when the client's fields arrive
### Step 7: Rights pass (R8), misc (R10)

(Steps 4-7 are expanded into their own checklists when they start.)

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
