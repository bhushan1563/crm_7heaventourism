import mongoose from 'mongoose';
import VisaModel from '../models/Visa.js';
import { normalizeVisaInput, visaNameKey } from '../utils/visaInput.js';
import { escapeRegex, queryString } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';

const fail = (res, message) => res.status(200).json({ success: false, message });
const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();
const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** The record as the web app receives it. */
const present = (doc) => {
  const { __v, deleted, nameKey, ...rest } = doc.toObject ? doc.toObject() : doc;
  return rest;
};

/** Used by the ownership check on update and delete. Deleted visas behave as if they do not exist. */
export const findVisaDocument = async (id) => {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return VisaModel.findOne({ _id: id, deleted: false });
};

/** The message for a visa that is already in the list (and a hint when it is only archived). */
const duplicateMessage = async (nameKey, exceptId) => {
  const other = await VisaModel.findOne({ nameKey, deleted: false, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select('country visaType entryType status').lean();
  if (!other) return null;
  const label = [other.country, other.visaType, other.entryType].filter(Boolean).join(', ');
  return other.status === 'Archived'
    ? `The ${label} visa is already in the visa list, but it is archived. Open the Archived tab and restore it instead of adding it again.`
    : `The ${label} visa is already in the visa list. Search for it instead of adding it again.`;
};

const SORTS = { updated: { updatedAt: -1, _id: -1 }, country: { country: 1, visaType: 1, _id: 1 } };

export const getVisas = async (req, res) => {
  try {
    const search = queryString(req.query.search);
    const status = queryString(req.query.status) || 'Active';
    const sort = SORTS[queryString(req.query.sort)] || SORTS.country;
    const limit = clampInt(req.query.limit, 1, 50, 20);
    const page = clampInt(req.query.page, 1, 10000, 1);

    const filter = { deleted: false };
    if (status !== 'all') filter.status = status === 'Archived' ? 'Archived' : 'Active';
    if (search) {
      const rx = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
      filter.$or = [{ country: rx }, { visaType: rx }, { entryType: rx }, { mode: rx }, { processingTime: rx }];
    }

    const [total, rows] = await Promise.all([
      VisaModel.countDocuments(filter),
      VisaModel.aggregate([
        { $match: filter },
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        // Only what the list shows: the checklist and the inclusions stay in the database.
        { $project: { country: 1, visaType: 1, entryType: 1, mode: 1, validity: 1, stay: 1, processingTime: 1, fees: 1, status: 1, createdByName: 1, updatedByName: 1, createdAt: 1, updatedAt: 1, documentCount: { $size: { $ifNull: ['$documents', []] } } } }
      ]).collation({ locale: 'en', strength: 2 })
    ]);
    res.json({ success: true, data: rows, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load the visa list'));
  }
};

export const getVisaById = async (req, res) => {
  try {
    const doc = await findVisaDocument(req.params.id);
    if (!doc) return fail(res, 'Visa not found. It may have been removed.');
    res.json({ success: true, data: present(doc) });
  } catch (error) {
    fail(res, friendlyMessage(error));
  }
};

export const createVisa = async (req, res) => {
  try {
    const input = normalizeVisaInput(req.body);
    if (!input.ok) return fail(res, input.message);
    const nameKey = visaNameKey(input.data.country, input.data.visaType, input.data.entryType);
    const duplicate = await duplicateMessage(nameKey);
    if (duplicate) return fail(res, duplicate);

    const doc = await VisaModel.create({
      ...input.data,
      nameKey,
      createdBy: String(req.user._id),
      createdByName: fullName(req.user),
      updatedBy: String(req.user._id),
      updatedByName: fullName(req.user)
    });
    res.json({ success: true, message: 'Visa saved to the visa list.', data: present(doc) });
  } catch (error) {
    // Two people adding the same visa at the same moment: the unique index let one of them win.
    if (error?.code === 11000) return fail(res, 'This visa was just added by someone else. Search for it in the visa list.');
    fail(res, friendlyMessage(error, 'Failed to save the visa'));
  }
};

export const updateVisa = async (req, res) => {
  try {
    const existing = await findVisaDocument(req.params.id);
    if (!existing) return fail(res, 'Visa not found. It may have been removed.');

    const input = normalizeVisaInput(req.body, { partial: true });
    if (!input.ok) return fail(res, input.message);

    const changes = { ...input.data };
    if (changes.country !== undefined || changes.visaType !== undefined || changes.entryType !== undefined) {
      changes.nameKey = visaNameKey(changes.country ?? existing.country, changes.visaType ?? existing.visaType, changes.entryType ?? existing.entryType);
      if (changes.nameKey !== existing.nameKey) {
        const duplicate = await duplicateMessage(changes.nameKey, existing._id);
        if (duplicate) return fail(res, duplicate);
      }
    }

    // Two people editing the same visa: the second save must not silently overwrite the first.
    const conflict = () =>
      fail(res, `This visa was changed by ${existing.updatedByName || existing.createdByName || 'someone else'} while you were editing it. Please reload to see their changes before saving.`);
    if (req.body.updatedAt !== undefined) {
      const seen = new Date(req.body.updatedAt).getTime();
      if (!Number.isFinite(seen) || seen !== existing.updatedAt.getTime()) return conflict();
    }

    const updated = await VisaModel.findOneAndUpdate(
      { _id: existing._id, deleted: false, updatedAt: existing.updatedAt }, // the version we validated against
      { $set: { ...changes, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } },
      { new: true, runValidators: true }
    );
    if (!updated) return conflict();
    res.json({ success: true, message: 'Visa updated.', data: present(updated) });
  } catch (error) {
    if (error?.code === 11000) return fail(res, 'Another visa with this country, type and entry is already in the list.');
    fail(res, friendlyMessage(error, 'Failed to update the visa'));
  }
};

export const deleteVisa = async (req, res) => {
  try {
    const existing = await findVisaDocument(req.params.id);
    if (!existing) return fail(res, 'Visa not found. It may have been removed.');
    // Hidden from every screen but kept in the database; quotations that used it keep their own copy.
    await VisaModel.updateOne({ _id: existing._id }, { $set: { deleted: true, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } });
    res.json({ success: true, message: 'Visa deleted.' });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to delete the visa'));
  }
};
