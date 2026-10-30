import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  MapPin,
  Mail,
  Phone,
  Edit2,
  Trash2,
  Star,
  Globe,
  Plane,
  FileCheck,
  ShieldAlert,
  Lock,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import supplierService from '../services/supplierService';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ExportButton from '../components/ExportButton';
import { SUPPLIER_CATEGORIES, SUPPLIER_CATEGORY_OPTIONS, SUPPLIER_RATINGS } from '../config';

export const SupplierListPage = () => {
  const { user, can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [deleteSupplierItem, setDeleteSupplierItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    category: 'Domestic',
    supplierName: '',
    contactPerson: '',
    phone: '',
    email: '',
    city: '',
    country: '',
    services: '',
    rating: 5,
    notes: '',
    active: true
  });

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await supplierService.getSuppliers();
      if (res.success) {
        setSuppliers(res.data);
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Error loading suppliers: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const matchesCat = selectedCategory === 'ALL' || s.category === selectedCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        (s.supplierName && s.supplierName.toLowerCase().includes(q)) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
        (s.phone && s.phone.includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.services && s.services.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q)) ||
        (s.country && s.country.toLowerCase().includes(q));

      return matchesCat && matchesSearch;
    });
  }, [suppliers, selectedCategory, searchQuery]);

  const handleOpenAdd = () => {
    setFormData({
      category: selectedCategory === 'ALL' ? 'Domestic' : selectedCategory,
      supplierName: '',
      contactPerson: '',
      phone: '',
      email: '',
      city: '',
      country: '',
      services: '',
      rating: 5,
      notes: '',
      active: true
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      category: supplier.category,
      supplierName: supplier.supplierName,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email || '',
      city: supplier.city || '',
      country: supplier.country || '',
      services: supplier.services || '',
      rating: supplier.rating || 5,
      notes: supplier.notes || '',
      active: supplier.active ?? true
    });
    setIsEditModalOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.supplierName || !formData.phone) {
      showToast('Supplier Name and Phone are required.', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const res = await supplierService.createSupplier(formData);
      if (res.success) {
        showToast('Supplier registered successfully!', 'success');
        setIsAddModalOpen(false);
        fetchSuppliers();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Failed to create supplier: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!formData.supplierName || !formData.phone) {
      showToast('Supplier Name and Phone are required.', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const res = await supplierService.updateSupplier(selectedSupplier._id, formData);
      if (res.success) {
        showToast('Supplier record updated successfully!', 'success');
        setIsEditModalOpen(false);
        fetchSuppliers();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Failed to update supplier: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteSupplierItem) return;
    try {
      setSubmitting(true);
      const res = await supplierService.deleteSupplier(deleteSupplierItem._id);
      if (res.success) {
        showToast('Supplier record removed.', 'info');
        setDeleteSupplierItem(null);
        fetchSuppliers();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Failed to delete supplier: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', fontFamily: 'var(--font-headline)' }}>
            Supplier Directory
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ExportButton
            moduleName="supplier_list"
            data={filteredSuppliers.map(s => ({
              'Category': s.category,
              'Supplier Name': s.supplierName,
              'Contact Person': s.contactPerson,
              'Phone': s.phone,
              'Email': s.email || '',
              'City': s.city || '',
              'Country': s.country || '',
              'Services': s.services || '',
              'Rating': s.rating || 5,
              'Active': s.active ? 'Active' : 'Inactive'
            }))}
            excelFilename="7Heaven_Suppliers.xlsx"
            csvFilename="7Heaven_Suppliers.csv"
          />

          {can('supplier_list', 'canCreate') ? (
            <button onClick={handleOpenAdd} className="btn btn-primary">
              <Plus size={16} />
              <span>Add New Supplier</span>
            </button>
          ) : (
            <button className="btn btn-outline" disabled title="No Create Permission">
              <Lock size={14} color="#f59e0b" />
              <span>Creation Locked</span>
            </button>
          )}

          <button onClick={fetchSuppliers} className="btn-icon btn-outline" title="Refresh Directory">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* 5-Category Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap'
        }}
      >
        {SUPPLIER_CATEGORY_OPTIONS.map((cat) => {
          const isSelected = selectedCategory === cat.value;
          const count = cat.value === 'ALL'
            ? suppliers.length
            : suppliers.filter((s) => s.category === cat.value).length;

          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => setSelectedCategory(cat.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 14px',
                borderRadius: '9px',
                border: isSelected ? '1px solid #2563EB' : '1px solid #E2E8F0',
                background: isSelected ? '#2563EB' : '#FFFFFF',
                color: isSelected ? '#FFFFFF' : '#475569',
                fontWeight: isSelected ? 700 : 600,
                fontSize: '0.8rem',
                fontFamily: 'var(--font-headline)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.25)' : '0 1px 2px rgba(0, 0, 0, 0.03)',
                whiteSpace: 'nowrap'
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 6px',
                  borderRadius: '9999px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.25)' : '#F1F5F9',
                  color: isSelected ? '#FFFFFF' : '#64748B',
                  fontWeight: 700
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="glass-panel" style={{ padding: '12px 16px' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '38px', height: '38px', fontSize: '0.825rem' }}
            placeholder="Search suppliers by name, contact person, phone, email, services, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="table-container" style={{ width: '100%', overflowX: 'hidden' }}>
        <table className="luxury-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '16%' }}>Supplier Name</th>
              <th style={{ width: '12%' }}>Category</th>
              <th style={{ width: '15%' }}>Contact Details</th>
              <th style={{ width: '13%' }}>Location</th>
              <th style={{ width: '15%' }}>Services & Notes</th>
              <th style={{ width: '8%' }}>Rating</th>
              <th style={{ width: '8%' }}>Status</th>
              <th style={{ textAlign: 'right', width: '65px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Loading supplier directory...
                </td>
              </tr>
            ) : filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  No suppliers found in this category.
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((sup) => {
                const isEditable = canEditRecord('supplier_list', sup);
                const canDelete = can('supplier_list', 'canDelete') && isEditable;

                return (
                  <tr key={sup._id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.825rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sup.supplierName}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                        Added by: {sup.createdByName || 'Admin'}
                      </div>
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                          background:
                            sup.category === 'Domestic' ? '#EFF6FF' :
                              sup.category === 'International' ? '#E1F5FE' :
                                sup.category === 'Flight Consolidator' ? '#E0F7FA' :
                                  sup.category === 'Visa' ? '#DCFCE7' : '#F1F5F9',
                          color:
                            sup.category === 'Domestic' ? '#2563EB' :
                              sup.category === 'International' ? '#0288D1' :
                                sup.category === 'Flight Consolidator' ? '#00838F' :
                                  sup.category === 'Visa' ? '#15803D' : '#475569',
                          border:
                            sup.category === 'Domestic' ? '1px solid #BFDBFE' :
                              sup.category === 'International' ? '1px solid #B3E5FC' :
                                sup.category === 'Flight Consolidator' ? '1px solid #B2EBF2' :
                                  sup.category === 'Visa' ? '1px solid #BBF7D0' : '1px solid #E2E8F0'
                        }}
                      >
                        {sup.category}
                      </span>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.8rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sup.contactPerson}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#0F172A', whiteSpace: 'nowrap' }}>
                          <Phone size={11} color="#10B981" style={{ flexShrink: 0 }} />
                          <span>{sup.phone}</span>
                        </div>
                        {sup.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.7rem', color: '#2563EB', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <Mail size={11} color="#2563EB" style={{ flexShrink: 0 }} />
                            <span>{sup.email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <MapPin size={12} color="#2563EB" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sup.city ? `${sup.city}, ` : ''}{sup.country}</span>
                      </div>
                    </td>

                    <td style={{ maxWidth: '160px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sup.services}>
                        {sup.services || ''}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#F59E0B' }}>
                        {[...Array(sup.rating || 5)].map((_, i) => (
                          <Star key={i} size={11} fill="#F59E0B" color="#F59E0B" />
                        ))}
                      </div>
                    </td>

                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 7px',
                          borderRadius: '9999px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          background: sup.active ? '#DCFCE7' : '#F1F5F9',
                          color: sup.active ? '#15803D' : '#64748B',
                          border: sup.active ? '1px solid #BBF7D0' : '1px solid #E2E8F0'
                        }}
                      >
                        {sup.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        {isEditable ? (
                          <button
                            onClick={() => handleOpenEdit(sup)}
                            className="btn-icon btn-outline btn-sm"
                            title="Edit Supplier"
                            style={{ width: '26px', height: '26px', padding: 0 }}
                          >
                            <Edit2 size={12} color="#2563EB" />
                          </button>
                        ) : (
                          <span title="Locked: Created by another member" style={{ padding: '4px', color: '#94A3B8' }}>
                            <Lock size={12} />
                          </span>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => setDeleteSupplierItem(sup)}
                            className="btn-icon btn-danger btn-sm"
                            title="Delete Supplier"
                            style={{ width: '26px', height: '26px', padding: 0 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Vendor to Directory"
      >
        <form onSubmit={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Supplier / Company Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Alpine Swiss DMC"
                value={formData.supplierName}
                onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                className="form-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
              >
                {SUPPLIER_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Contact Person *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Marc Zimmermann"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 98200 55443"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="vendor@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rating (1 to 5 Stars)</label>
              <select
                className="form-select"
                value={formData.rating}
                onChange={(e) => setFormData({ ...formData, rating: Number(e.target.value) })}
              >
                {SUPPLIER_RATINGS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">City</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Zurich / Mumbai"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Country</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Switzerland / India"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Offered Services & Scope</label>
            <textarea
              className="form-textarea"
              rows="3"
              placeholder="e.g. Luxury chalet bookings, VIP transfers, Schengen priority visa assistance..."
              value={formData.services}
              onChange={(e) => setFormData({ ...formData, services: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Register Supplier'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Supplier Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Supplier: ${selectedSupplier?.supplierName}`}
      >
        <form onSubmit={handleUpdate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Supplier Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.supplierName}
                onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                {SUPPLIER_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Contact Person *</label>
              <input
                type="text"
                className="form-input"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="text"
                className="form-input"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rating</label>
              <select
                className="form-select"
                value={formData.rating}
                onChange={(e) => setFormData({ ...formData, rating: Number(e.target.value) })}
              >
                {SUPPLIER_RATINGS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Offered Services</label>
            <textarea
              className="form-textarea"
              rows="3"
              value={formData.services}
              onChange={(e) => setFormData({ ...formData, services: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <label className="switch">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
            <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600 }}>
              Vendor is Active & Available
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={submitting}
            >
              {submitting ? 'Updating...' : 'Save Vendor Details'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteSupplierItem)}
        onClose={() => setDeleteSupplierItem(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Supplier"
        message={`Are you sure you want to remove "${deleteSupplierItem?.supplierName}" from the ${deleteSupplierItem?.category} directory?`}
        confirmText="Remove Supplier"
        isDanger={true}
        isLoading={submitting}
      />
    </div>
  );
};

export default SupplierListPage;
