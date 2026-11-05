import MasterTextModel, { MASTER_TEXT_KEY } from '../models/MasterText.js';

/** The company's saved standard Notes and Policy text as a plain object, or null when the built-in text is in use. */
export const loadMasterText = async () => MasterTextModel.findOne({ key: MASTER_TEXT_KEY }).lean();
