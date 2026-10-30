import mongoose from 'mongoose';
import SupplierModel from '../models/Supplier.js';

export const findSupplierDocument = async (id) => {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return SupplierModel.findById(id);
};

const buildSupplierFilter = (query = {}) => {
  const filter = {};
  filter.deleted = false;
  if (query.category) filter.category = query.category;
  if (query.search) {
    const regex = new RegExp(query.search, 'i');
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
    res.status(200).json({ success: false, message: 'Failed to fetch suppliers: ' + error.message });
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
    res.status(200).json({ success: false, message: error.message });
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
    res.status(200).json({ success: false, message: 'Failed to add supplier: ' + error.message });
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
      ...req.body,
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
    res.status(200).json({ success: false, message: 'Failed to update supplier: ' + error.message });
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
    res.status(200).json({ success: false, message: 'Failed to delete supplier: ' + error.message });
  }
};

export const getSupplierStats = async (req, res) => {
  try {
    const suppliers = await SupplierModel.find({ deleted: false }).sort({ createdAt: -1 });
    const stats = {
      total: suppliers.length,
      domestic: suppliers.filter(s => s.category === 'Domestic').length,
      international: suppliers.filter(s => s.category === 'International').length,
      flightConsolidator: suppliers.filter(s => s.category === 'Flight Consolidator').length,
      visa: suppliers.filter(s => s.category === 'Visa').length,
      general: suppliers.filter(s => s.category === 'General').length,
      activeCount: suppliers.filter(s => s.active).length
    };
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(200).json({ success: false, message: error.message });
  }
};
