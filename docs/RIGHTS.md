# Rights and security

Who may do what is decided in one place, `backend/src/config/rights.js`. The API, the Rights screen and the tests all read from it, so adding a module means editing that one list.

## The rights

| Right | Means |
|---|---|
| read | see the module and its records |
| create | add records (for hotels and itineraries this includes adding photos; confirming a booking also needs *read* on quotations) |
| update | change records (cancelling a booking is an update) |
| delete | remove records. Hotels and itineraries are deleted from view but kept; **bookings are cancelled, never deleted** |
| download | print or save as PDF/Word: the preview windows, the builder's Print buttons and the itinerary export all honour it |
| edit others | change records made by or assigned to someone else |

Two rules sit on top of the rights:

- **Confirmed bookings are locked.** A record that is Confirmed can only be changed by the people assigned to it (creator, sales, ops) and by an Admin, even for someone who has *edit others*.
- **A confirmed quotation is locked for everyone**, Admin included, until its booking is cancelled.

An **Admin** always has every right in every module. A right saved for one person beats a right saved for their role, which beats the built-in default below. The Rights screen shows this combined result for the person or role you select (the same rule the API applies on every request), so what you see there is what they can really do.

## Built-in defaults

These apply to a module until someone saves something for it on the Rights screen. Saved rights always win, so the live system may differ from this table. Nobody but an Admin gets *delete* by default.

<!-- rights-table:start -->
| Module | Admin | Sales | Ops | Viewer |
|---|---|---|---|---|
| `guest_list` | everything | read | read | read |
| `supplier_list` | everything | read | read | read |
| `quotations` | everything | read | read | read |
| `hotels` | everything | create, read, update, edit others | create, read, update, edit others | read |
| `itineraries` | everything | create, read, update, download, edit others | create, read, update, download, edit others | read |
| `visas` | everything | create, read, update, edit others | create, read, update, edit others | read |
| `confirmations` | everything | create, read, update, download, edit others | create, read, update, download, edit others | read |
| `users` | everything | read | read | read |
| `rights` | everything | read | read | read |
| `scanner` | everything | read | read | read |
| `reports` | everything | read | read | read |
<!-- rights-table:end -->

This table is generated from the code. A test (`backend/test/rights-doc.test.js`) fails if it goes out of date; regenerate it with `defaultRightsTable()` from `backend/src/config/rights.js`.

## Every route is guarded

`backend/test/routes-rights.test.js` reads the real routers and fails when a route has no guard, asks for the wrong right (a GET that needs *delete*, a DELETE that only needs *read*), or can be called without signing in. The only routes without a rights check are signing in and each person's own account, and photo upload, which is guarded by what the photo is for.

## Open points

- **Passport numbers and payments** on bookings can be read by every role by default (as for the other modules). An Admin can switch *read* off for Viewers on the Rights screen.
- **Per quotation type** visibility (for example, only some people may see Visa quotations) is not built. It was listed as a possible extension and needs the client's answer.
- **Miscellaneous requests (R10)**: the client has not sent their list yet.
