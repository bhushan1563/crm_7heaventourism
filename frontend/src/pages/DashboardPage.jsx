import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  ScanLine,
  ArrowRight,
  Sparkles,
  MapPin
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import guestService from '../services/guestService';
import supplierService from '../services/supplierService';
import { formatDate } from '../utils/dateHelper';

export const DashboardPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [guestStats, setGuestStats] = useState(null);
  const [supplierStats, setSupplierStats] = useState(null);
  const [recentGuests, setRecentGuests] = useState([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [gStatsRes, sStatsRes, guestsRes] = await Promise.all([
        guestService.getStats(),
        supplierService.getStats(),
        guestService.getGuests()
      ]);

      if (gStatsRes.success) {setGuestStats(gStatsRes.data);} else {showToast(gStatsRes.message, 'error');}
      if (sStatsRes.success) {setSupplierStats(sStatsRes.data);} else {showToast(sStatsRes.message, 'error');}
      if (guestsRes.success) {setRecentGuests(guestsRes.data.slice(0, 5));} else {showToast(guestsRes.message, 'error');}
    } catch (err) {
      showToast('Error loading dashboard metrics: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome Banner */}
      <div
        className="glass-panel-hero animate-fade-in rs-banner"
        style={{
          padding: '28px 32px',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ zIndex: 1, maxWidth: '650px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', fontFamily: 'var(--font-headline)' }}>
            Welcome, {user?.firstName} {user?.lastName}
          </h2>
          <p style={{ color: '#94A3B8', fontSize: '0.9rem', marginTop: '6px', lineHeight: 1.5 }}>
            Here is your live inquiry pipeline, categorized vendor records, and document scanner activity for today.
          </p>
        </div>

        <div className="page-actions" style={{ zIndex: 1 }}>
          <button
            onClick={() => navigate('/scanner')}
            className="btn btn-primary"
          >
            <ScanLine size={16} />
            <span>Launch Scanner</span>
          </button>
          <button
            onClick={() => navigate('/guests')}
            className="btn btn-outline"
          >
            <span>View All Inquiries</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <StatCard
          title="Total Inquiries"
          value={guestStats?.total || 0}
          subtitle="All generated leads"
          icon={Users}
          color="#2563EB"
          trend="+12% this month"
        />

        <StatCard
          title="Under Process"
          value={guestStats?.underProcess || 0}
          subtitle="Pending quotes & discussion"
          icon={Clock}
          color="#F59E0B"
        />

        <StatCard
          title="Confirmed & Paid"
          value={guestStats?.confirmedAndPaid || 0}
          subtitle="Ready for operations execution"
          icon={DollarSign}
          color="#10B981"
          trend="Highest Conversion"
        />

        <StatCard
          title="Active Suppliers"
          value={supplierStats?.total || 0}
          subtitle="Across 5 global categories"
          icon={Building2}
          color="#0288D1"
        />
      </div>

      {/* Pipeline Status Breakdown & Category Grid */}
      <div className="rs-two-col" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
        {/* Status Pipeline Visual */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', fontFamily: 'var(--font-headline)' }}>
                Inquiry Stage Distribution
              </h3>
              <p style={{ fontSize: '0.775rem', color: '#64748B' }}>
                Real-time conversion tracking across life-cycle stages
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 700, background: '#EFF6FF', padding: '4px 10px', borderRadius: '9999px' }}>
              Live Synced
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: 'Under Process', count: guestStats?.underProcess || 0, color: '#F59E0B' },
              { label: 'Quoted', count: guestStats?.quoted || 0, color: '#2563EB' },
              { label: 'Confirmed', count: guestStats?.confirmed || 0, color: '#8B5CF6' },
              { label: 'Confirmed & Payment received', count: guestStats?.confirmedAndPaid || 0, color: '#10B981' },
              { label: 'Travelled', count: guestStats?.travelled || 0, color: '#26C6DA' },
              { label: 'Cancelled', count: guestStats?.cancelled || 0, color: '#DC2626' }
            ].map((stage) => {
              const total = guestStats?.total || 1;
              const pct = Math.round((stage.count / total) * 100) || 0;

              return (
                <div key={stage.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', marginBottom: '6px' }}>
                    <span style={{ color: '#334155', fontWeight: 600 }}>{stage.label}</span>
                    <span style={{ color: stage.color, fontWeight: 700 }}>
                      {stage.count} ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: '8px', width: '100%', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: stage.color,
                        borderRadius: '4px',
                        transition: 'width 0.6s ease'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Supplier Category Summary */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', fontFamily: 'var(--font-headline)' }}>
                Suppliers by 5 Categories
              </h3>
              <p style={{ fontSize: '0.775rem', color: '#64748B' }}>
                Vendor network segregation
              </p>
            </div>
            <button
              onClick={() => navigate('/suppliers')}
              className="btn-icon btn-outline btn-sm"
              title="View Suppliers"
            >
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { cat: 'Domestic', count: supplierStats?.domestic || 0, icon: '🏠', color: '#2563EB', bg: '#EFF6FF' },
              { cat: 'International', count: supplierStats?.international || 0, icon: '✈️', color: '#0288D1', bg: '#E1F5FE' },
              { cat: 'Flight Consolidator', count: supplierStats?.flightConsolidator || 0, icon: '🛫', color: '#26C6DA', bg: '#E0F7FA' },
              { cat: 'Visa', count: supplierStats?.visa || 0, icon: '🛂', color: '#10B981', bg: '#ECFDF5' },
              { cat: 'General', count: supplierStats?.general || 0, icon: '🌐', color: '#64748B', bg: '#F1F5F9' }
            ].map((item) => (
              <div
                key={item.cat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0F172A' }}>{item.cat}</span>
                </div>
                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    padding: '2px 10px',
                    borderRadius: '6px',
                    background: item.bg,
                    color: item.color
                  }}
                >
                  {item.count} Vendors
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Inquiries Quick Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', fontFamily: 'var(--font-headline)' }}>
              Recent Guest Inquiries
            </h3>
          </div>
          <button
            onClick={() => navigate('/guests')}
            className="btn btn-secondary btn-sm"
          >
            <span>Manage All Inquiries</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div className="table-container">
          <table className="luxury-table table-stack">
            <thead>
              <tr>
                <th>Sr No</th>
                <th>Inquiry Date</th>
                <th>Guest Names</th>
                <th>Destination</th>
                <th>Travel Date</th>
                <th>Status</th>
                <th>Sales / Ops</th>
              </tr>
            </thead>
            <tbody>
              {recentGuests.map((g) => (
                <tr key={g._id || g.srNo}>
                  <td data-label="Sr No" style={{ fontWeight: 700, color: '#2563EB' }}>{g.srNo}</td>
                  <td data-label="Inquiry Date" style={{ color: '#64748B' }}>{formatDate(g.inquiryDate)}</td>
                  <td data-label="Guest">
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{g.guestNames}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{g.contactNumber}</div>
                  </td>
                  <td data-label="Destination">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
                      <MapPin size={13} color="#2563EB" />
                      <span>{g.destination}</span>
                    </div>
                  </td>
                  <td data-label="Travel Date" style={{ color: '#475569' }}>{formatDate(g.travelDate)}</td>
                  <td data-label="Status">
                    <StatusBadge status={g.status} />
                  </td>
                  <td data-label="Sales / Ops">
                    <div style={{ fontSize: '0.775rem', color: '#2563EB', fontWeight: 600 }}>Sales: {g.sales}</div>
                    <div style={{ fontSize: '0.775rem', color: '#0D9488', fontWeight: 600 }}>Ops: {g.ops}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
