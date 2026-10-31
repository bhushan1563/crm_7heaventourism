import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ScanLine,
  Camera,
  UploadCloud,
  Sparkles,
  UserCheck,
  Building2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import scannerService from '../services/scannerService';
import guestService from '../services/guestService';
import supplierService from '../services/supplierService';
import Modal from '../components/Modal';
import { formatDate } from '../utils/dateHelper';
import { SUPPLIER_CATEGORIES } from '../config';
import { getErrorMessage } from '../services/api';

export const MobileScannerPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState('upload'); // 'upload' | 'camera'
  const [imagePreview, setImagePreview] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Quick Action Modals
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states for instant creation
  const [guestFormData, setGuestFormData] = useState({
    guestNames: '',
    email: '',
    contactNumber: '',
    status: 'Under Process',
    sales: user ? `${user.firstName} ${user.lastName}` : 'Sales Agent',
    ops: '',
    paxCount: 2,
    budget: '',
    notes: ''
  });

  const [supplierFormData, setSupplierFormData] = useState({
    supplierName: '',
    category: 'Domestic',
    contactPerson: '',
    email: '',
    phone: '',
    city: '',
    country: 'India',
    services: '',
    rating: 5,
    active: true
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Camera Management
  const startCamera = async () => {
    try {
      setMode('camera');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err) {
      showToast('Camera access unavailable or permission denied. Please use file upload.', 'warning');
      setMode('upload');
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg');
    setImagePreview(dataUrl);
    stopCamera();
    processScannedImage(dataUrl, 'camera_capture');
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result);
      processScannedImage(reader.result, 'file_upload');
    };
    reader.readAsDataURL(file);
  };

  // Process and extract structured data via OCR engine
  const processScannedImage = async (dataUrl, source) => {
    try {
      setIsScanning(true);
      setParsedData(null);

      const payload = {
        image: dataUrl,
        scanType: source
      };

      const res = await scannerService.processScan(payload);
      if (res.success) {
        setParsedData(res.data);
        showToast('Document OCR scanned and entities extracted successfully!', 'success');
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      const errMsg = getErrorMessage(err, 'OCR processing failed');
      showToast(errMsg, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleOpenSendToGuest = () => {
    if (!parsedData) return;
    setGuestFormData({
      guestNames: parsedData.guestNames || '',
      email: parsedData.email || '',
      contactNumber: parsedData.contactNumber || parsedData.phone || '',
      status: 'Under Process',
      sales: user ? `${user.firstName} ${user.lastName}` : '',
      salesId: user ? user._id : '',
      ops: '',
      opsId: '',
      paxCount: 2,
      budget: '',
      notes: `Imported via Mobile Scanner OCR: ${parsedData.companyName || parsedData.guestNames || ''}`
    });
    setIsGuestModalOpen(true);
  };

  const handleOpenSendToSupplier = () => {
    if (!parsedData) return;
    setSupplierFormData({
      supplierName: parsedData.companyName || `${parsedData.contactPerson || 'Vendor'} Travel DMC`,
      category: parsedData.country && parsedData.country !== 'India' ? 'International' : 'Domestic',
      contactPerson: parsedData.contactPerson || parsedData.guestNames || '',
      email: parsedData.email || '',
      phone: parsedData.phone || parsedData.contactNumber || '',
      city: parsedData.city || '',
      country: parsedData.country || 'India',
      services: "",
      rating: 5,
      active: true
    });
    setIsSupplierModalOpen(true);
  };

  const handleGuestSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await guestService.createGuest(guestFormData);
      if (res.success) {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        showToast(`Inquiry ${res.data.srNo} registered directly in Guest List!`, 'success');
        setIsGuestModalOpen(false);
        navigate('/guests');
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Error creating guest'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupplierSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await supplierService.createSupplier(supplierFormData);
      if (res.success) {
        showToast(`Supplier "${res.data.supplierName}" added to Supplier List!`, 'success');
        setIsSupplierModalOpen(false);
        navigate('/suppliers');
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Error creating supplier'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div className="page-header animate-fade-in" style={{ position: 'relative', zIndex: 20 }}>
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Mobile Document &amp; Card Scanner</h2>
            <span className="count-chip" style={{ background: 'var(--bg-EFF8FF)', color: 'var(--fg-175CD3)', borderColor: 'var(--bd-B2DDFF)' }}>OCR engine</span>
          </div>
          <p className="page-subtitle">Scan a visiting card or document and turn it into a guest or supplier record.</p>
        </div>

        {/* Mode Switcher */}

        <div className="page-actions">
          <button
            onClick={() => {
              stopCamera();
              setMode('upload');
            }}
            className={`btn btn-sm ${mode === 'upload' ? 'btn-primary' : 'btn-outline'}`}
          >
            <UploadCloud size={15} />
            <span>Upload Image</span>
          </button>
          <button
            onClick={startCamera}
            className={`btn btn-sm ${mode === 'camera' ? 'btn-primary' : 'btn-outline'}`}
          >
            <Camera size={15} />
            <span>Live Camera</span>
          </button>
        </div>
      </div>

      {/* Main Scanner Workspace Grid */}
      <div className="rs-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Left Box: Capture / Upload Viewport */}
        <div
          className="glass-panel"
          style={{
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '380px',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {isScanning && <div className="scanner-laser" />}

          {mode === 'camera' ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '100%',
                  height: '280px',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  background: '#0F172A',
                  position: 'relative'
                }}
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: '20px',
                    border: '2px dashed #2563EB',
                    borderRadius: '10px',
                    pointerEvents: 'none'
                  }}
                />
              </div>

              <button onClick={capturePhoto} className="btn btn-primary" style={{ padding: '10px 24px' }}>
                <Camera size={17} />
                <span>Snap & Scan Document</span>
              </button>
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                border: '2px dashed #2563EB',
                borderRadius: '14px',
                background: 'var(--bg-F8FAFC)',
                cursor: 'pointer'
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />

              {imagePreview ? (
                <div style={{ textAlign: 'center', width: '100%' }}>
                  <img
                    src={imagePreview}
                    alt="Scan Preview"
                    style={{
                      maxHeight: '220px',
                      maxWidth: '100%',
                      borderRadius: '10px',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                      marginBottom: '12px'
                    }}
                  />
                  <div style={{ fontSize: '0.8rem', color: 'var(--fg-64748B)' }}>
                    Click to choose a different image
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: 'var(--bg-EFF6FF)',
                      color: 'var(--fg-2563EB)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px auto'
                    }}
                  >
                    <UploadCloud size={28} />
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--fg-0F172A)', marginBottom: '4px', fontFamily: 'var(--font-headline)' }}>
                    Upload Visiting Card or Document
                  </h4>
                  <p style={{ fontSize: '0.775rem', color: 'var(--fg-64748B)', maxWidth: '300px' }}>
                    Drag and drop or browse JPEG/PNG image files. Card OCR will extract entities automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Box: Parsed Structured Data & Action Panel */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--fg-0F172A)', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-headline)' }}>
                <Sparkles size={16} color="#26C6DA" />
                <span>Extracted Entities & Metadata</span>
              </h3>
              {parsedData && (
                <span style={{ fontSize: '0.75rem', color: 'var(--fg-16A34A)', fontWeight: 700, background: 'var(--bg-DCFCE7)', padding: '2px 8px', borderRadius: '9999px' }}>
                  ✓ Parsing Complete
                </span>
              )}
            </div>

            {isScanning ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-64748B)' }}>
                <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--fg-2563EB)' }} />
                <div style={{ fontWeight: 700, color: 'var(--fg-0F172A)' }}>Scanning card content...</div>
                <div style={{ fontSize: '0.775rem', marginTop: '4px' }}>Detecting guest names, emails, phone numbers</div>
              </div>
            ) : parsedData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-F8FAFC)',
                    border: '1px solid var(--bd-E2E8F0)'
                  }}
                >
                  <div style={{ fontSize: '0.725rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', fontWeight: 600 }}>Extracted Name</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--fg-0F172A)', marginTop: '2px' }}>
                    {parsedData.guestNames}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-F8FAFC)', border: '1px solid var(--bd-E2E8F0)' }}>
                    <div style={{ fontSize: '0.725rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', fontWeight: 600 }}>Phone Number</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fg-10B981)', marginTop: '2px' }}>
                      {parsedData.contactNumber}
                    </div>
                  </div>

                  <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-F8FAFC)', border: '1px solid var(--bd-E2E8F0)' }}>
                    <div style={{ fontSize: '0.725rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', fontWeight: 600 }}>Email Address</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--fg-2563EB)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {parsedData.email || 'None detected'}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-F8FAFC)', border: '1px solid var(--bd-E2E8F0)' }}>
                  <div style={{ fontSize: '0.725rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', fontWeight: 600 }}>Company / Organization</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--fg-334155)', marginTop: '2px', fontWeight: 500 }}>
                    {parsedData.companyName || 'Not specified'}
                  </div>
                </div>

                {parsedData.rawText && (
                  <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-F8FAFC)', border: '1px solid var(--bd-E2E8F0)' }}>
                    <div style={{ fontSize: '0.725rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 600 }}>Raw OCR Text Detected</div>
                    <pre style={{ fontSize: '0.75rem', color: 'var(--fg-334155)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', maxHeight: '90px', overflowY: 'auto', margin: 0 }}>
                      {parsedData.rawText}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fg-94A3B8)' }}>
                <ScanLine size={32} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
                <div style={{ fontSize: '0.9rem' }}>No scanned document active</div>
                <div style={{ fontSize: '0.775rem', marginTop: '4px' }}>Capture a card on the left or choose a sample to parse.</div>
              </div>
            )}
          </div>

          {/* Action Buttons to Update App */}
          {parsedData && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--bd-E2E8F0)', paddingTop: '16px' }}>
              <button
                onClick={handleOpenSendToGuest}
                className="btn btn-primary"
                style={{ fontSize: '0.825rem' }}
              >
                <UserCheck size={16} />
                <span>Add to Guest List</span>
              </button>

              <button
                onClick={handleOpenSendToSupplier}
                className="btn btn-secondary"
                style={{ fontSize: '0.825rem' }}
              >
                <Building2 size={16} />
                <span>Add to Supplier List</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Guest Confirmation Modal */}
      <Modal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        title="Confirm Scanned Guest Inquiry"
      >
        <form onSubmit={handleGuestSubmit}>
          <div className="form-group">
            <label className="form-label">Guest Names *</label>
            <input
              type="text"
              className="form-input"
              value={guestFormData.guestNames}
              onChange={(e) => setGuestFormData({ ...guestFormData, guestNames: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Contact Number *</label>
              <input
                type="text"
                className="form-input"
                value={guestFormData.contactNumber}
                onChange={(e) => setGuestFormData({ ...guestFormData, contactNumber: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                value={guestFormData.email}
                onChange={(e) => setGuestFormData({ ...guestFormData, email: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsGuestModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Confirm & Save to Guest List'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Supplier Confirmation Modal */}
      <Modal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        title="Confirm Scanned Supplier"
      >
        <form onSubmit={handleSupplierSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Supplier Name *</label>
              <input
                type="text"
                className="form-input"
                value={supplierFormData.supplierName}
                onChange={(e) => setSupplierFormData({ ...supplierFormData, supplierName: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                className="form-select"
                value={supplierFormData.category}
                onChange={(e) => setSupplierFormData({ ...supplierFormData, category: e.target.value })}
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
                value={supplierFormData.contactPerson}
                onChange={(e) => setSupplierFormData({ ...supplierFormData, contactPerson: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Phone Number *</label>
              <input
                type="text"
                className="form-input"
                value={supplierFormData.phone}
                onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsSupplierModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Confirm & Save to Supplier List'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default MobileScannerPage;
