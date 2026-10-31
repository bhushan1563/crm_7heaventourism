import mongoose from 'mongoose';
import SupplierModel from '../models/Supplier.js';
import { containsRegex, pick, queryString } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';

export const findSupplierDocument = async (id) => {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return SupplierModel.findById(id);
};

// Fields a client may change through PUT /suppliers/:id. Ownership, audit and delete flags are server-controlled.
const UPDATABLE_SUPPLIER_FIELDS = [
  'supplierName',
  'category',
  'contactPerson',
  'email',
  'phone',
  'city',
  'country',
  'services',
  'rating',
  'active',
  'notes'
];

const buildSupplierFilter = (query = {}) => {
  const filter = {};
  filter.deleted = false;
  const category = queryString(query.category);
  const search = queryString(query.search);
  if (category) filter.category = category;
  if (search) {
    const regex = containsRegex(search);
    filter.$or = [
      { supplierName: regex },
      { contactPerson: regex },
      { email: regex },
      { phone: regex },
      { city: regex },
      { services: regex }
    ];
  }
  return filter;
};

export const getSuppliers = async (req, res) => {
  try {
    const suppliers = await SupplierModel.find(buildSupplierFilter(req.query)).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: suppliers.length,
      data: suppliers
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to fetch suppliers') });
  }
};

export const getSupplierById = async (req, res) => {
  try {
    const supplier = await findSupplierDocument(req.params.id);
    if (!supplier) {
      return res.status(200).json({ success: false, message: 'Supplier not found.' });
    }
    res.json({ success: true, data: supplier });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error) });
  }
};

export const createSupplier = async (req, res) => {
  try {
    const {
      supplierName,
      category,
      contactPerson,
      email,
      phone,
      city,
      country = 'India',
      services,
      rating = 5,
      active = true,
      notes
    } = req.body;

    if (!supplierName || !category || !contactPerson || !phone) {
      return res.status(200).json({
        success: false,
        message: 'Please provide Supplier Name, Category, Contact Person, and Phone Number.'
      });
    }

    const validCategories = ['All', 'Domestic', 'International', 'Flight Consolidator', 'Visa', 'General'];
    if (!validCategories.includes(category)) {
      return res.status(200).json({
        success: false,
        message: `Category must be one of: ${validCategories.join(', ')}`
      });
    }

    const newSupplier = await SupplierModel.create({
      supplierName: supplierName.trim(),
      category,
      contactPerson: contactPerson.trim(),
      email: email ? email.trim() : '',
      phone: phone.trim(),
      city: city ? city.trim() : '',
      country: country ? country.trim() : 'India',
      services: services ? services.trim() : '',
      rating: Number(rating) || 5,
      active: active !== undefined ? active : true,
      notes: notes || '',
      createdBy: req.user._id,
      createdByName: `${req.user.firstName} ${req.user.lastName}`,
      updatedBy: req.user._id,
      updatedByName: `${req.user.firstName} ${req.user.lastName}`
    });

    res.status(200).json({
      success: true,
      message: 'Supplier added successfully.',
      data: newSupplier
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to add supplier') });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const supplierId = req.params.id;
    const existing = await findSupplierDocument(supplierId);
    if (!existing) {
      return res.status(200).json({ success: false, message: 'Supplier not found.' });
    }

    const updateData = {
      ...pick(req.body, UPDATABLE_SUPPLIER_FIELDS),
      updatedBy: req.user._id,
      updatedByName: `${req.user.firstName} ${req.user.lastName}`
    };

    const updated = await SupplierModel.findByIdAndUpdate(existing._id, updateData, { new: true });

    res.json({
      success: true,
      message: 'Supplier updated successfully.',
      data: updated
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to update supplier') });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const supplierId = req.params.id;
    const existing = await findSupplierDocument(supplierId);
    if (!existing) {
      return res.status(200).json({ success: false, message: 'Supplier not found.' });
    }

    await SupplierModel.findByIdAndUpdate(existing._id, { deleted: true });

    res.json({
      success: true,
      message: 'Supplier deleted successfully.'
    });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to delete supplier') });
  }
};

export const getSupplierStats = async (req, res) => {
  try {
    const [byCategory, activeCount] = await Promise.all([
      SupplierModel.aggregate([{ $match: { deleted: false } }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      SupplierModel.countDocuments({ deleted: false, active: true })
    ]);
    const countFor = (category) => byCategory.find((row) => row._id === category)?.count || 0;
    const stats = {
      total: byCategory.reduce((sum, row) => sum + row.count, 0),
      domestic: countFor('Domestic'),
      international: countFor('International'),
      flightConsolidator: countFor('Flight Consolidator'),
      visa: countFor('Visa'),
      general: countFor('General'),
      activeCount
    };
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error) });
  }
};
