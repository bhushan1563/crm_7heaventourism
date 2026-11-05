// The current clients: everyone who has made an inquiry or a booking, one entry per person. Pure functions (no database).
//
// The same person turns up many times (an inquiry, a second trip, a booking), often with the number or the e-mail written
// differently, so records are joined by e-mail address or by the last ten digits of the phone number. A record with neither is
// joined by name.

const text = (v) => String(v ?? '').trim();
const emailKey = (v) => text(v).toLowerCase();
const phoneKey = (v) => {
  const digits = text(v).replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
};
const nameKey = (v) => text(v).toLowerCase().replace(/\s+/g, ' ');
const day = (value) => {
  const d = value instanceof Date ? value : value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};

const keysOf = ({ email, phone, name }) => {
  const keys = [];
  if (emailKey(email)) keys.push(`e:${emailKey(email)}`);
  if (phoneKey(phone)) keys.push(`p:${phoneKey(phone)}`);
  if (!keys.length && nameKey(name)) keys.push(`n:${nameKey(name)}`);
  return keys;
};

const addUnique = (list, value, same = (a, b) => a === b) => {
  const v = text(value);
  if (v && !list.some((x) => same(x, v))) list.push(v);
};

/**
 * @param {{ guests?: object[], confirmations?: object[] }} sources the guest inquiries and the bookings (each may be left out)
 * @returns {object[]} one entry per person, by name: { id, name, emails, phones, inquiries, bookings, destination, travelDate, status, sales, guestId, confirmationId }
 */
export const clientsFrom = ({ guests = [], confirmations = [] } = {}) => {
  const records = [
    ...guests.map((g) => ({ kind: 'guest', id: String(g._id), name: g.guestNames, email: g.email, phone: g.contactNumber, destination: g.destination, travelDate: day(g.travelDate), status: text(g.status), sales: g.sales, seen: day(g.createdAt) })),
    ...confirmations.map((c) => ({ kind: 'booking', id: String(c._id), name: c.clientName, email: c.clientEmail, phone: c.clientPhone, destination: c.destination, travelDate: day(c.travelDate), status: text(c.status), sales: c.sales, seen: day(c.createdAt) }))
  ];

  const groups = [];
  const byKey = new Map();
  for (const record of records) {
    const keys = keysOf(record);
    if (!keys.length) continue;
    const found = [...new Set(keys.map((k) => byKey.get(k)).filter(Boolean))];
    let group = found[0];
    if (!group) {
      group = { keys: new Set(), records: [] };
      groups.push(group);
    }
    for (const other of found.slice(1)) {
      other.records.forEach((r) => group.records.push(r));
      other.keys.forEach((k) => group.keys.add(k));
      groups.splice(groups.indexOf(other), 1);
    }
    group.records.push(record);
    keys.forEach((k) => group.keys.add(k));
    group.keys.forEach((k) => byKey.set(k, group));
  }

  return groups
    .map((group) => {
      const newest = [...group.records].sort((a, b) => (b.travelDate || b.seen).localeCompare(a.travelDate || a.seen))[0];
      const emails = [];
      const phones = [];
      for (const r of group.records) {
        addUnique(emails, r.email, (a, b) => a.toLowerCase() === b.toLowerCase());
        addUnique(phones, r.phone, (a, b) => phoneKey(a) === phoneKey(b) && Boolean(phoneKey(a)));
      }
      const guestIds = group.records.filter((r) => r.kind === 'guest');
      const bookings = group.records.filter((r) => r.kind === 'booking');
      return {
        id: [...group.keys].sort()[0],
        name: text(newest.name) || 'Client',
        emails,
        phones,
        inquiries: guestIds.length,
        bookings: bookings.filter((b) => b.status !== 'Cancelled').length,
        destination: text(newest.destination),
        travelDate: newest.travelDate,
        status: newest.status,
        sales: text(newest.sales),
        guestId: guestIds.length ? [...guestIds].sort((a, b) => b.seen.localeCompare(a.seen))[0].id : '',
        confirmationId: bookings.length ? bookings[bookings.length - 1].id : ''
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
};
