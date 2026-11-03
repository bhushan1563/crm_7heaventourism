import MasterTextModel, { MASTER_TEXT_KEY } from '../models/MasterText.js';
import { MASTER_LISTS, normalizeMasterText } from '../utils/masterTextInput.js';
import { friendlyMessage } from '../utils/errors.js';

const fail = (res, message) => res.status(200).json({ success: false, message });
const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();

/** The saved standard text as the web app receives it, or null when the built-in text is in use. */
const present = (doc) => {
  if (!doc) return null;
  const out = { updatedAt: doc.updatedAt, updatedByName: doc.updatedByName || '' };
  for (const [key] of MASTER_LISTS) out[key] = [...(doc[key] || [])];
  return out;
};

export const getMasterText = async (req, res) => {
  try {
    res.json({ success: true, data: present(await MasterTextModel.findOne({ key: MASTER_TEXT_KEY })) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load the standard notes and policies'));
  }
};

export const saveMasterText = async (req, res) => {
  try {
    const input = normalizeMasterText(req.body);
    if (!input.ok) return fail(res, input.message);

    const existing = await MasterTextModel.findOne({ key: MASTER_TEXT_KEY });
    // Two Admins editing at once: the second save must not silently replace the first.
    if (req.body.updatedAt !== undefined && existing) {
      const seen = new Date(req.body.updatedAt).getTime();
      if (!Number.isFinite(seen) || seen !== existing.updatedAt.getTime()) {
        return fail(res, `The standard notes and policies were changed by ${existing.updatedByName || 'someone else'} while you were editing. Please reload to see their changes before saving yours.`);
      }
    }

    const saved = await MasterTextModel.findOneAndUpdate(
      { key: MASTER_TEXT_KEY },
      { $set: { ...input.data, updatedBy: String(req.user._id), updatedByName: fullName(req.user) }, $setOnInsert: { key: MASTER_TEXT_KEY } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ success: true, message: 'The standard notes and policies were saved. New quotations will start with them.', data: present(saved) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to save the standard notes and policies'));
  }
};

/** Back to the built-in standard text: the saved record is removed. Quotations already made are not touched. */
export const resetMasterText = async (req, res) => {
  try {
    await MasterTextModel.deleteOne({ key: MASTER_TEXT_KEY });
    res.json({ success: true, message: 'The standard notes and policies are back to the built-in text.', data: null });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to go back to the built-in text'));
  }
};
