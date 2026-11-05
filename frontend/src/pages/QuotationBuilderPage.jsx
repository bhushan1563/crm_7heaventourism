import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Eye,
  Download,
  Printer,
  Sparkles,
  Plane,
  Building2,
  FileText,
  IndianRupee,
  Calendar,
  Users,
  CheckCircle2,
  ChevronDown,
  Layers,
  ArrowUpDown,
  Loader2,
  ExternalLink,
  FileCheck,
  PlusCircle,
  MinusCircle,
  Briefcase,
  Hotel,
  Luggage,
  Receipt,
  Utensils,
  MapPin,
  Tag,
  CreditCard,
  AlertTriangle,
  ShieldAlert,
  BookOpen,
  Car,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import {
  QUOTATION_STATUSES,
  QUOTATION_TYPES,
  HOTEL_STAR_RATINGS,
  MEAL_PLANS,
  FLIGHT_TYPES
} from '../config';
import { useToast } from '../context/ToastContext';
import quotationService from '../services/quotationService';
import guestService from '../services/guestService';
import userService from '../services/userService';
import QuotationDocumentView from '../components/QuotationDocumentView';
import { generateQuotationPDF, printQuotation, printFlightVoucher } from '../utils/quotationPdfGenerator';
import QuotationLivePreview from '../components/QuotationLivePreview';
import { formatDate, toInputDate } from '../utils/dateHelper';
import { getErrorMessage } from '../services/api';
import LazyRichTextEditor from '../components/LazyRichTextEditor';
import PhotoGallery from '../components/PhotoGallery';
import ItineraryPicker from '../components/itinerary/ItineraryPicker';
import HotelPicker from '../components/hotel/HotelPicker';
import TagInput from '../components/itinerary/TagInput';
import FormattedLine from '../components/quotation/FormattedLine';
import OptionsEditor from '../components/quotation/OptionsEditor';
import { hotelsOfFirstOption, optionsProblem, repriceOptions, startHotelOptions, startOptions } from '../utils/quotationOptions';
import { startRates } from '../utils/rateTable';
import { DEFAULT_CANCELLATION_POLICY, DEFAULT_EXCLUSIONS, DEFAULT_IMPORTANT_NOTES, DEFAULT_PAYMENT_POLICY, DEFAULT_VEHICLE_NOTES } from '../utils/standardText';
import { standardLists, startingLists } from '../utils/masterText';
import masterTextService from '../services/masterTextService';
import VehiclesEditor from '../components/quotation/VehiclesEditor';
import { isLandService, landServiceProblem, startLandService, vehiclesPayload } from '../utils/landService';
import VisaEditor from '../components/quotation/VisaEditor';
import PriceTablesEditor from '../components/quotation/PriceTablesEditor';
import VisaPicker from '../components/visa/VisaPicker';
import SaveVisaToList from '../components/visa/SaveVisaToList';
import ConfirmDialog from '../components/ConfirmDialog';
import visaService from '../services/visaService';
import { applyVisaItem, hasVisaContent, visaTitle } from '../utils/visaList';
import { layoutOf, priceTablesPayload, priceTablesProblem, startPricingFor, startPriceTables, tablesOf, usesPriceTables, withTables } from '../utils/priceTables';
import { nextPriceNote } from '../utils/pricingNote';
import { richToPlainText } from '../utils/richText';
import { feesPayload, followGuests, isVisa, startVisa, visaIssue, visaPayload } from '../utils/visa';
import hotelService from '../services/hotelService';
import { detailsFrom, insertItinerary, mergeLines, plainLines } from '../utils/itineraryInsert';
import { blankStay, hotelDestination, hotelQuotationProblem, isPlaceholderTitle, quotationFromHotel, stayFromHotel } from '../utils/hotelStay';
import { AMENITY_RULES } from '../utils/hotel';
import './quotationHotels.css';
import '../components/confirmation/confirmation.css';

// The tabs of the builder for a quotation type. A land service has no hotels, flights or separate price tab (its vehicles carry the
// rates); a visa has no itinerary, hotels or flights either: the visa with its documents, and the fees, take their place.
const tabsFor = (quotation) => {
  if (isLandService(quotation)) {
    return [
      { id: 'overview', label: '1. Trip & Type', icon: Users },
      { id: 'itinerary', label: '2. Itinerary', icon: Calendar },
      { id: 'package', label: '3. Vehicles & Rates', icon: Car },
      { id: 'notes', label: '4. Notes & Terms', icon: FileText }
    ];
  }
  if (isVisa(quotation)) {
    return [
      { id: 'overview', label: '1. Client & Type', icon: Users },
      { id: 'visa', label: '2. Visa & Documents', icon: FileCheck },
      { id: 'visaFees', label: '3. Fees & Services', icon: Receipt },
      { id: 'notes', label: '4. Notes & Terms', icon: FileText }
    ];
  }
  return [
    { id: 'overview', label: '1. Trip & Type', icon: Users },
    { id: 'itinerary', label: '2. Itinerary', icon: Calendar },
    { id: 'package', label: '3. Hotel Details', icon: Building2 },
    { id: 'flights', label: '4. Flights', icon: Plane },
    { id: 'pricing', label: '5. Pricing', icon: IndianRupee },
    { id: 'notes', label: '6. Notes & Terms', icon: FileText }
  ];
};

const DEFAULT_COMPANY = {
  name: '7HEAVEN TOURISM',
  tagline: 'Travel with the Trust',
  description: 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings',
  address: '405 (FOF) Kanha Capital, Above IDFC bank, Opp Express Tower Hotel, Alkapuri 390007, Vadodara',
  phone: '+91 7862829178',
  email: 'sales@7heaventourism.in',
  website: 'www.7heaventourism.in'
};

const DEFAULT_INCLUSIONS = [
  'Meet and greet assistance on arrival & departure',
  'Accommodation in mentioned / similar hotels',
  'Daily Breakfast & Dinner as per tour itinerary',
  'Assistance provided by dedicated driver / representative throughout the tour',
  'Transfers & sightseeing by private dedicated AC vehicle',
  'All toll taxes, parking fees, fuel & driver allowances'
];

const DEFAULT_PRICING_ITEMS = [
  { id: 'pkg', name: 'Package Price', costPerPerson: 0, totalCost: 0, note: 'Per person', isIncluded: true, type: 'per_person' },
  { id: 'air', name: 'Airfare', costPerPerson: 0, totalCost: 0, note: 'Per person', isIncluded: true, type: 'per_person' },
  { id: 'oth', name: 'Other', costPerPerson: 0, totalCost: 0, note: 'Per person', isIncluded: true, type: 'per_person' }
];

export const QuotationBuilderPage = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const guestIdParam = searchParams.get('guestId');
  const hotelIdParam = searchParams.get('hotelId'); // "Create quotation" on a hotel of the hotel list
  const visaIdParam = searchParams.get('visaId'); // "Create quotation" on a visa of the visa list
  const newVisaParam = searchParams.get('type') === 'Visa'; // "New visa quotation" in the Visas section

  const { user, can } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const isEditMode = Boolean(id);

  // Active top-level tab in form builder
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'itinerary' | 'package' | 'flights' | 'pricing' | 'notes'
  // Active pricing component subtab
  const [pricingActiveTab, setPricingActiveTab] = useState('pkg'); // 'pkg' | 'air' | 'oth' | custom id | 'total'

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [visaPickerOpen, setVisaPickerOpen] = useState(false); // choose a visa from the visa list
  const [askUsualList, setAskUsualList] = useState(false); // "go back to the usual price list?" for a quotation priced with the pricing table
  const [askTables, setAskTables] = useState(false); // "use the pricing table?" for a hotel or package quotation that still has the per-person list
  const [pendingVisa, setPendingVisa] = useState(null); // the visa chosen, waiting for the person to agree to replace what is typed
  const [pickerOpen, setPickerOpen] = useState(false); // the "Insert from the itinerary library" dialog
  const [hotelPicker, setHotelPicker] = useState(null); // the "Choose from the hotel list" dialog: { mode: 'new' } or { index }

  const [guestsList, setGuestsList] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Form State
  const [formData, setFormData] = useState({
    quotationNo: '',
    quotationType: 'Package', // 'Only Hotel' | 'Package' | 'Events / Corporate'
    priceTables: startPriceTables({ quotationType: 'Package' }), // a new package (and hotel) quotation is priced with the pricing tables
    guestId: '',
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    destination: '',
    duration: '',
    paxDetails: '',
    travelDate: '',
    validUntil: '',
    status: 'Draft',
    sales: user ? `${user.firstName} ${user.lastName}` : '',
    salesId: user ? user._id : '',
    ops: '',
    opsId: '',
    companyDetails: { ...DEFAULT_COMPANY },
    itinerary: [],
    endOfTourNote: '***End of the Tour***',
    packageDetails: {
      hotels: [],
      roomInfo: '',
      inclusions: [...DEFAULT_INCLUSIONS]
    },
    pricing: {
      packageCostPerPerson: 0,
      packageCostNote: '',
      airfareCostPerPerson: 0,
      airfareCostNote: '',
      otherCostPerPerson: 0,
      otherCostNote: '',
      totalCostPerPerson: 0,
      totalCostNote: '',
      grandTotal: 0,
      currency: 'Rs',
      notes: '',
      items: [...DEFAULT_PRICING_ITEMS]
    },
    asPerFlightTicket: false,
    flightTicketNote: 'Flight details will be as per confirmed flight ticket',
    flightTicketUrl: '',
    flightDetails: [],
    exclusions: [...DEFAULT_EXCLUSIONS],
    paymentPolicy: [...DEFAULT_PAYMENT_POLICY],
    cancellationPolicy: [...DEFAULT_CANCELLATION_POLICY],
    vehicleNotes: [...DEFAULT_VEHICLE_NOTES],
    importantNotes: [...DEFAULT_IMPORTANT_NOTES]
  });

  // The company's own standard Notes and Policy text (the master text), when an Admin has saved one: a new quotation starts with it,
  // but only in a list nobody has typed in yet, and "Reset Default" goes back to it. Without one the built-in text is used, as before.
  const [master, setMaster] = useState(null);
  useEffect(() => {
    let cancelled = false;
    masterTextService
      .get()
      .then((res) => {
        if (cancelled || !res?.success || !res.data) return;
        setMaster(res.data);
        if (!isEditMode) setFormData((prev) => ({ ...prev, ...startingLists(prev, res.data) }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEditMode]);

  // Load Initial Data (Guests, Users, Existing Quotation or GuestParam)
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const [gRes, uRes] = await Promise.all([
          guestService.getGuests(),
          userService.getUsers()
        ]);

        if (gRes.success) {setGuestsList(gRes.data);} else {showToast(gRes.message, 'error');}
        if (uRes.success) {setUsersList(uRes.data);} else {showToast(uRes.message, 'error');}

        if (isEditMode) {
          const qRes = await quotationService.getQuotationById(id);
          if (qRes.success && qRes.data) {
            const data = qRes.data;
            // Ensure company details and pricing items are normalized
            const companyDetails = {
              ...DEFAULT_COMPANY,
              ...(data.companyDetails || {}),
              tagline: data.companyDetails?.tagline || DEFAULT_COMPANY.tagline,
              email: data.companyDetails?.email || DEFAULT_COMPANY.email
            };

            let pricingItems = data.pricing?.items && data.pricing.items.length > 0
              ? data.pricing.items
              : [
                { id: 'pkg', name: 'Package Price', costPerPerson: data.pricing?.packageCostPerPerson || 0, totalCost: 0, note: data.pricing?.packageCostNote || 'Per person', isIncluded: true, type: 'per_person' },
                { id: 'air', name: 'Airfare', costPerPerson: data.pricing?.airfareCostPerPerson || 0, totalCost: 0, note: data.pricing?.airfareCostNote || 'Per person', isIncluded: true, type: 'per_person' },
                { id: 'oth', name: 'Other', costPerPerson: data.pricing?.otherCostPerPerson || 0, totalCost: 0, note: data.pricing?.otherCostNote || 'Per person', isIncluded: true, type: 'per_person' }
              ];

            setFormData({
              ...data,
              quotationType: data.quotationType || 'Package',
              companyDetails,
              paymentPolicy: (data.paymentPolicy && data.paymentPolicy.length > 0) ? data.paymentPolicy : [...DEFAULT_PAYMENT_POLICY],
              cancellationPolicy: (data.cancellationPolicy && data.cancellationPolicy.length > 0) ? data.cancellationPolicy : [...DEFAULT_CANCELLATION_POLICY],
              pricing: {
                ...data.pricing,
                items: pricingItems
              }
            });
          }
          else {
            showToast(qRes.message || 'Failed to load quotation data.', 'error');
          }
        } else if (guestIdParam) {
          // Pre-populate from Guest Inquiry
          const targetGuest = gRes.data?.find(g => g._id === guestIdParam || g.srNo === guestIdParam);
          if (targetGuest) {
            handleGuestSelect(targetGuest);
          }
        }

        // Started from a visa of the visa list: a visa quotation with that visa's details, checklist, fees and inclusions already in.
        if (!isEditMode && visaIdParam) {
          const vRes = await visaService.get(visaIdParam);
          if (vRes.success) {
            setFormData((prev) => {
              const started = { ...prev, quotationType: 'Visa', ...startVisa(prev) };
              return { ...started, ...applyVisaItem(started, vRes.data), destination: visaTitle(vRes.data) };
            });
            showToast(`A visa quotation for ${vRes.data.country} was started. Add the client and the number of applicants, then check the fees.`, 'success');
          } else {
            showToast(vRes.message || 'That visa could not be opened, so the quotation starts empty.', 'error');
          }
        }

        // Started with "New visa quotation": a visa quotation with the visa fee and service charge lines ready to fill in.
        if (!isEditMode && !visaIdParam && newVisaParam) {
          setFormData((prev) => ({ ...prev, quotationType: 'Visa', ...startVisa(prev) }));
        }

        // Started from a hotel of the hotel list: a hotel quotation with that hotel already chosen.
        if (!isEditMode && hotelIdParam) {
          const hRes = await hotelService.get(hotelIdParam);
          if (hRes.success) {
            const draft = quotationFromHotel(hRes.data);
            setFormData((prev) => {
              const withHotel = { ...prev, packageDetails: { ...prev.packageDetails, hotels: [draft.stay] } };
              // The hotel is the first hotel of Option 1; Option 2 is ready for the other choice (for example the 4 star hotels).
              const next = { ...withHotel, quotationType: draft.quotationType, destination: draft.destination, duration: draft.duration, ...startHotelOptions(withHotel) };
              return { ...next, ...startPricingFor(next, draft.quotationType) }; // and its pricing sheet, named after the hotel options
            });
            showToast(`A hotel quotation for ${hRes.data.name} was started. It is the first hotel of Option 1; add the client and the dates, more hotels, and the prices.`, 'success');
          } else {
            showToast(hRes.message || 'That hotel could not be opened, so the quotation starts empty.', 'error');
          }
        }
      } catch (err) {
        showToast('Error initializing quotation builder: ' + getErrorMessage(err), 'error');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [id, guestIdParam]);

  const handleGuestSelect = (guest) => {
    if (!guest) return;
    setFormData(prev => ({
      ...prev,
      guestId: guest._id,
      clientName: guest.guestNames || prev.clientName,
      clientEmail: guest.email || prev.clientEmail,
      clientPhone: guest.contactNumber || prev.clientPhone,
      destination: guest.destination || prev.destination,
      paxDetails: `${guest.paxCount || 2} Adults`,
      ...followGuests(prev, `${guest.paxCount || 2} Adults`),
      travelDate: guest.travelDate || prev.travelDate,
      sales: guest.sales || prev.sales,
      salesId: guest.salesId || prev.salesId,
      ops: guest.ops || prev.ops,
      opsId: guest.opsId || prev.opsId
    }));
    showToast(`Pre-populated details for ${guest.guestNames}`, 'info');
  };

  // Helper to extract numeric pax count
  const getPaxNumber = (paxStr) => {
    const match = (paxStr || '').match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  };

  // Recalculate Pricing Totals from Items
  const recalculatePricing = (items, paxDetails, currentPricing) => {
    const paxNum = getPaxNumber(paxDetails);
    let totalPerPerson = 0;
    let grandTotal = 0;

    const updatedItems = items.map(item => {
      const perPerson = Number(item.costPerPerson) || 0;
      const total = item.type === 'fixed'
        ? Number(item.totalCost) || (perPerson * paxNum)
        : perPerson * paxNum;

      if (item.isIncluded !== false) {
        totalPerPerson += perPerson;
        grandTotal += total;
      }

      return {
        ...item,
        costPerPerson: perPerson,
        totalCost: total
      };
    });

    // Map backwards-compatible fields
    const pkgItem = updatedItems.find(i => i.id === 'pkg' || i.name.toLowerCase().includes('package') || i.name.toLowerCase().includes('hotel'));
    const airItem = updatedItems.find(i => i.id === 'air' || i.name.toLowerCase().includes('airfare') || i.name.toLowerCase().includes('flight'));
    const othItem = updatedItems.find(i => i.id === 'oth' || i.name.toLowerCase().includes('other'));

    return {
      ...currentPricing,
      items: updatedItems,
      packageCostPerPerson: pkgItem ? pkgItem.costPerPerson : (currentPricing.packageCostPerPerson || 0),
      packageCostNote: pkgItem ? pkgItem.note : (currentPricing.packageCostNote || `Per person X ${paxDetails || 'Pax'}`),
      airfareCostPerPerson: airItem ? airItem.costPerPerson : (currentPricing.airfareCostPerPerson || 0),
      airfareCostNote: airItem ? airItem.note : (currentPricing.airfareCostNote || `Per person X ${paxDetails || 'Pax'}`),
      otherCostPerPerson: othItem ? othItem.costPerPerson : (currentPricing.otherCostPerPerson || 0),
      otherCostNote: othItem ? othItem.note : (currentPricing.otherCostNote || `Per person`),
      totalCostPerPerson: totalPerPerson,
      totalCostNote: nextPriceNote(currentPricing.totalCostNote, currentPricing.totalCostPerPerson, totalPerPerson), // follows the price until someone writes their own
      grandTotal: grandTotal
    };
  };

  // Update specific pricing item
  const handleUpdatePricingItem = (index, field, value) => {
    setFormData(prev => {
      const items = [...(prev.pricing?.items || DEFAULT_PRICING_ITEMS)];
      items[index] = { ...items[index], [field]: value };
      const updatedPricing = recalculatePricing(items, prev.paxDetails, prev.pricing);
      return { ...prev, pricing: updatedPricing };
    });
  };

  // Add a new dynamic pricing add-on component
  const handleAddPricingItem = () => {
    const newId = 'add_' + Date.now().toString(36);
    setFormData(prev => {
      const items = [
        ...(prev.pricing?.items || DEFAULT_PRICING_ITEMS),
        {
          id: newId,
          name: 'New Add-on Service',
          costPerPerson: 0,
          totalCost: 0,
          note: `Per person X ${prev.paxDetails || 'Pax'}`,
          isIncluded: true,
          type: 'per_person'
        }
      ];
      const updatedPricing = recalculatePricing(items, prev.paxDetails, prev.pricing);
      return { ...prev, pricing: updatedPricing };
    });
    setPricingActiveTab(newId);
    showToast('New pricing add-on tab created!', 'info');
  };

  // Remove pricing item
  const handleRemovePricingItem = (index) => {
    setFormData(prev => {
      const items = (prev.pricing?.items || []).filter((_, i) => i !== index);
      const updatedPricing = recalculatePricing(items, prev.paxDetails, prev.pricing);
      return { ...prev, pricing: updatedPricing };
    });
    setPricingActiveTab('total');
  };

  // Itinerary helpers
  const handleAddDay = () => {
    setFormData(prev => {
      const nextDayNum = (prev.itinerary?.length || 0) + 1;
      const dayStr = nextDayNum < 10 ? `Day 0${nextDayNum}` : `Day ${nextDayNum}`;
      return {
        ...prev,
        itinerary: [
          ...(prev.itinerary || []),
          {
            dayNumber: dayStr,
            title: '',
            description: ''
          }
        ]
      };
    });
  };

  // Copies a saved itinerary into this quotation. The days become part of the quotation and can be edited freely; the
  // library original is not touched. Returns { ok: false, message } when it cannot be inserted (the dialog shows why).
  const handleInsertItinerary = (itinerary, { mode, copyLists, fillDetails }) => {
    const result = insertItinerary(formData.itinerary || [], itinerary, mode);
    if (!result.ok) return result;
    setFormData((prev) => ({
      ...prev,
      itinerary: result.days,
      ...(fillDetails ? detailsFrom(prev, itinerary) : {}),
      ...(copyLists
        ? {
            packageDetails: { ...prev.packageDetails, inclusions: mergeLines(prev.packageDetails?.inclusions, plainLines(itinerary.inclusions)) },
            exclusions: mergeLines(prev.exclusions, plainLines(itinerary.exclusions))
          }
        : {})
    }));
    showToast(`Added ${result.added} ${result.added === 1 ? 'day' : 'days'} from "${itinerary.title}". You can change anything here; the library itinerary stays as it was.`, 'success');
    return { ok: true };
  };

  const handleRemoveDay = (index) => {
    setFormData(prev => ({
      ...prev,
      itinerary: (prev.itinerary || []).filter((_, i) => i !== index)
    }));
  };

  const handleUpdateDay = (index, field, value) => {
    setFormData(prev => {
      const updated = [...(prev.itinerary || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, itinerary: updated };
    });
  };

  // Hotel helpers
  const handleAddHotel = () => {
    setFormData(prev => ({
      ...prev,
      packageDetails: {
        ...prev.packageDetails,
        hotels: [
          ...(prev.packageDetails?.hotels || []),
          {
            nights: '1 Night',
            city: '',
            hotelName: '',
            starRating: '4 star',
            roomCategory: 'Deluxe Room',
            mealPlan: 'CP (Breakfast Only)',
            checkInDate: '',
            checkOutDate: '',
            noOfRooms: '1 Room',
            address: '',
            contactNumber: '',
            contactPerson: '',
            email: '',
            notes: ''
          }
        ]
      }
    }));
  };

  // A hotel chosen from the hotel list becomes a new stay, or replaces the details of the stay it was chosen for. The stay
  // gets its own copy of the hotel's details and photos; dates, nights and rooms already entered are kept.
  const handlePickHotel = (hotel) => {
    const target = hotelPicker;
    setFormData((prev) => {
      const retitle = prev.quotationType === 'Only Hotel' && isPlaceholderTitle(prev.destination);
      const title = retitle ? { destination: hotelDestination(hotel) } : {};
      if (target && target.option !== undefined) {
        // A hotel for one of the options: replace the hotel it was chosen for, or add it to that option.
        // A hotel quotation made before the pricing tables came back carries a rate table for every hotel, so the room rate row is
        // ready as soon as the hotel is chosen. With the pricing tables the prices are on the Pricing tab and the hotel has no table.
        const withRates = (stay) => (prev.quotationType === 'Only Hotel' && !usesPriceTables(prev) && !stay.rates?.length ? { ...stay, rates: startRates() } : stay);
        const options = (prev.options || []).map((option, i) => {
          if (i !== target.option) return option;
          const hotels = [...option.hotels];
          if (target.hotel === null || target.hotel === undefined || !hotels[target.hotel]) hotels.push(withRates(stayFromHotel(hotel, blankStay())));
          else hotels[target.hotel] = withRates(stayFromHotel(hotel, hotels[target.hotel]));
          return { ...option, hotels };
        });
        return { ...prev, ...title, options: repriceOptions(options, prev.paxDetails) };
      }
      const hotels = [...(prev.packageDetails?.hotels || [])];
      if (target && target.mode !== 'new' && hotels[target.index]) hotels[target.index] = stayFromHotel(hotel, hotels[target.index]);
      else hotels.push(stayFromHotel(hotel, blankStay()));
      return { ...prev, ...title, packageDetails: { ...prev.packageDetails, hotels } };
    });
    showToast(`${hotel.name} was taken from the hotel list. Its details and photos are copied below; you can still change them.`, 'success');
    return { ok: true };
  };

  // Hotel options: the hotels the quotation already has become Option 1 (and the quotation's own list is emptied, so the
  // same hotels are never shown twice); going back to a single offer keeps the hotels of the first option.
  const handleStartOptions = () => {
    setFormData((prev) => ({
      ...prev,
      options: repriceOptions(startOptions(prev.packageDetails?.hotels || []), prev.paxDetails),
      packageDetails: { ...prev.packageDetails, hotels: [] }
    }));
    showToast('Hotel options are on. Option 1 has the hotels you had; fill in Option 2 and the prices.', 'info');
  };
  const handleSingleOffer = () => {
    setFormData((prev) => ({ ...prev, options: [], packageDetails: { ...prev.packageDetails, hotels: hotelsOfFirstOption(prev.options) } }));
    showToast('Back to a single offer. The hotels of the first option were kept.', 'info');
  };

  // A quotation that has the per-person price list takes the pricing tables (Option 1 and Option 2, named after its hotel options). The
  // prices typed under its hotel options (a price per person, a hotel's rate table) are taken out, so there is one place for the price.
  const switchToPricingTables = () => {
    setAskTables(false);
    setFormData((prev) => {
      const options = (prev.options || []).map((option) => ({ ...option, pricePerPerson: 0, totalPrice: 0, hotels: option.hotels.map((hotel) => ({ ...hotel, rates: [] })) }));
      const next = { ...prev, options };
      return { ...next, ...startPricingFor(next, prev.quotationType) };
    });
    showToast('The pricing table is on. Fill in each option; the hotels of each option are on the Hotel Details tab.', 'info');
  };

  const handleRemoveHotel = (index) => {
    setFormData(prev => ({
      ...prev,
      packageDetails: {
        ...prev.packageDetails,
        hotels: (prev.packageDetails?.hotels || []).filter((_, i) => i !== index)
      }
    }));
  };

  const handleUpdateHotel = (index, field, value) => {
    setFormData(prev => {
      const hotels = [...(prev.packageDetails?.hotels || [])];
      hotels[index] = { ...hotels[index], [field]: value };
      return {
        ...prev,
        packageDetails: { ...prev.packageDetails, hotels }
      };
    });
  };

  // Inclusions helpers
  const handleAddInclusion = () => {
    setFormData(prev => ({
      ...prev,
      packageDetails: {
        ...prev.packageDetails,
        inclusions: [...(prev.packageDetails?.inclusions || []), '']
      }
    }));
  };

  const handleUpdateInclusion = (index, value) => {
    setFormData(prev => {
      const incs = [...(prev.packageDetails?.inclusions || [])];
      incs[index] = value;
      return {
        ...prev,
        packageDetails: { ...prev.packageDetails, inclusions: incs }
      };
    });
  };

  const handleRemoveInclusion = (index) => {
    setFormData(prev => ({
      ...prev,
      packageDetails: {
        ...prev.packageDetails,
        inclusions: (prev.packageDetails?.inclusions || []).filter((_, i) => i !== index)
      }
    }));
  };

  // Exclusion helpers
  const handleAddExclusion = () => {
    setFormData(prev => ({
      ...prev,
      exclusions: [...(prev.exclusions || []), '']
    }));
  };

  const handleUpdateExclusion = (index, value) => {
    setFormData(prev => {
      const list = [...(prev.exclusions || [])];
      list[index] = value;
      return { ...prev, exclusions: list };
    });
  };

  const handleRemoveExclusion = (index) => {
    setFormData(prev => ({
      ...prev,
      exclusions: (prev.exclusions || []).filter((_, i) => i !== index)
    }));
  };

  // Payment Policy helpers
  const handleAddPaymentPolicy = () => {
    setFormData(prev => ({
      ...prev,
      paymentPolicy: [...(prev.paymentPolicy || []), '']
    }));
  };

  const handleUpdatePaymentPolicy = (index, value) => {
    setFormData(prev => {
      const list = [...(prev.paymentPolicy || [])];
      list[index] = value;
      return { ...prev, paymentPolicy: list };
    });
  };

  const handleRemovePaymentPolicy = (index) => {
    setFormData(prev => ({
      ...prev,
      paymentPolicy: (prev.paymentPolicy || []).filter((_, i) => i !== index)
    }));
  };

  const handleResetPaymentPolicy = () => {
    setFormData(prev => ({
      ...prev,
      paymentPolicy: standardLists(master).paymentPolicy
    }));
  };

  // Cancellation Policy helpers
  const handleAddCancellationPolicy = () => {
    setFormData(prev => ({
      ...prev,
      cancellationPolicy: [...(prev.cancellationPolicy || []), '']
    }));
  };

  const handleUpdateCancellationPolicy = (index, value) => {
    setFormData(prev => {
      const list = [...(prev.cancellationPolicy || [])];
      list[index] = value;
      return { ...prev, cancellationPolicy: list };
    });
  };

  const handleRemoveCancellationPolicy = (index) => {
    setFormData(prev => ({
      ...prev,
      cancellationPolicy: (prev.cancellationPolicy || []).filter((_, i) => i !== index)
    }));
  };

  const handleResetCancellationPolicy = () => {
    setFormData(prev => ({
      ...prev,
      cancellationPolicy: standardLists(master).cancellationPolicy
    }));
  };

  // Vehicle Guideline helpers
  const handleAddVehicleNote = () => {
    setFormData(prev => ({
      ...prev,
      vehicleNotes: [...(prev.vehicleNotes || []), '']
    }));
  };

  const handleUpdateVehicleNote = (index, value) => {
    setFormData(prev => {
      const list = [...(prev.vehicleNotes || [])];
      list[index] = value;
      return { ...prev, vehicleNotes: list };
    });
  };

  const handleRemoveVehicleNote = (index) => {
    setFormData(prev => ({
      ...prev,
      vehicleNotes: (prev.vehicleNotes || []).filter((_, i) => i !== index)
    }));
  };

  // Important Notes helpers
  const handleAddImportantNote = () => {
    setFormData(prev => ({
      ...prev,
      importantNotes: [...(prev.importantNotes || []), '']
    }));
  };

  const handleUpdateImportantNote = (index, value) => {
    setFormData(prev => {
      const list = [...(prev.importantNotes || [])];
      list[index] = value;
      return { ...prev, importantNotes: list };
    });
  };

  const handleRemoveImportantNote = (index) => {
    setFormData(prev => ({
      ...prev,
      importantNotes: (prev.importantNotes || []).filter((_, i) => i !== index)
    }));
  };

  // Flight Segment helpers
  const handleAddFlight = () => {
    setFormData(prev => {
      const currentFlights = prev.flightDetails || [];
      return {
        ...prev,
        flightDetails: [
          ...currentFlights,
          {
            flightType: currentFlights.length === 0 ? 'Departure' : 'Return',
            departureDate: '',
            route: '',
            cabinClass: 'Economy - Normal',
            airline: 'Indigo',
            flightNumber: '',
            operatedBy: 'Operated by: Indigo',
            fromAirport: '',
            depTime: '',
            depDate: '',
            depTerminal: '',
            duration: '',
            flightStop: 'Non-stop',
            toAirport: '',
            arrTime: '',
            arrDate: '',
            arrTerminal: '',
            baggageCheckIn: '15 kg',
            baggageCabin: '7 kg'
          }
        ]
      };
    });
  };

  const handleRemoveFlight = (index) => {
    setFormData(prev => ({
      ...prev,
      flightDetails: (prev.flightDetails || []).filter((_, i) => i !== index)
    }));
  };

  const handleUpdateFlight = (index, field, value) => {
    setFormData(prev => {
      const flights = [...(prev.flightDetails || [])];
      flights[index] = { ...flights[index], [field]: value };
      return { ...prev, flightDetails: flights };
    });
  };

  // Save Quotation
  const handleSave = async (downloadAfter = false) => {
    if (formData.confirmationId) {
      showToast(`This quotation is confirmed as ${formData.confirmationNo} and is locked. Cancel the booking first if the quotation has to change.`, 'warning');
      return;
    }
    if (!formData.clientName.trim()) {
      showToast('Please enter the client name.', 'warning');
      setActiveTab('overview');
      return;
    }
    if (!formData.destination.trim()) {
      showToast('Please enter the destination title.', 'warning');
      setActiveTab('overview');
      return;
    }
    // A hotel quotation is made from the hotel list: every stay must be a hotel taken from it.
    // A visa is checked on its country, applicants and fees; a land service on its vehicles; otherwise: with hotel options the
    // hotels live inside the options (each is checked there), and without them the quotation's own stays are.
    const visaTrouble = visaIssue(formData);
    if (visaTrouble) {
      showToast(visaTrouble.message, 'warning');
      setActiveTab(visaTrouble.tab);
      return;
    }
    const tablesProblem = priceTablesProblem(formData);
    if (tablesProblem) {
      showToast(tablesProblem, 'warning');
      setActiveTab('pricing');
      return;
    }
    const hotelProblem = isVisa(formData) ? null : isLandService(formData) ? landServiceProblem(formData) : formData.options?.length ? optionsProblem(formData) : hotelQuotationProblem(formData);
    if (hotelProblem) {
      showToast(hotelProblem, 'warning');
      setActiveTab('package');
      return;
    }

    try {
      setSaving(true);
      let res;
      const base = isVisa(formData)
        ? { ...formData, visa: visaPayload(formData.visa), visaFees: feesPayload(formData.visaFees) }
        : isLandService(formData) ? { ...formData, vehicles: vehiclesPayload(formData.vehicles) } : formData;
      // The pricing tables belong to hotel and package quotations only; for any other type they are left out of the request.
      const { priceTables: _tables, ...withoutTables } = base;
      // A hotel or package quotation always says whether it has pricing tables: an empty list is how one that went back to the usual price list clears them.
      const payload = layoutOf(formData) ? { ...withoutTables, priceTables: priceTablesPayload(formData.priceTables || []) } : withoutTables;
      if (isEditMode) {
        res = await quotationService.updateQuotation(id, payload);
      } else {
        res = await quotationService.createQuotation(payload);
      }

      if (res.success) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });

        // A visa quotation is kept with the visas: it can be found there by destination, changed, and sent to the client.
        const toClientVisas = isVisa(formData) && can('visas', 'canRead');
        showToast(toClientVisas ? `Quotation ${res.data.quotationNo} saved. You will find it under Visas > Client visas, where you can send it to the client.` : `Quotation ${res.data.quotationNo} saved successfully!`, 'success');

        if (downloadAfter) {
          const cleanDest = (res.data.destination || '7Heaven').replace(/[^a-zA-Z0-9]/g, '_');
          const filename = `7Heaven_Quotation_${cleanDest}_${res.data.quotationNo || 'Doc'}.pdf`;
          await generateQuotationPDF('quotation-live-render-view', filename);
          showToast('Quotation PDF generated and downloaded!', 'success');
        }

        navigate(toClientVisas ? '/visas?view=clients' : '/quotations');
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Failed to save quotation: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // A visa chosen from the visa list fills the details, checklist, fees and inclusions; the client, the applicants and the notes stay.
  const applyPickedVisa = (visa) => {
    setFormData((prev) => ({ ...prev, ...applyVisaItem(prev, visa), destination: prev.destination?.trim() ? prev.destination : visaTitle(visa) }));
    showToast(`The ${visa.country} visa was added to this quotation. Check the fees and the number of applicants.`, 'success');
  };

  const currentPricingItems = formData.pricing?.items || DEFAULT_PRICING_ITEMS;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Action Bar */}
      <div
        className="glass-panel-azure animate-fade-in rs-banner"
        style={{
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => navigate('/quotations')}
            className="btn btn-outline btn-sm btn-icon"
            title="Back to Quotations List"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
                {isEditMode ? `Edit Quotation: ${formData.quotationNo}` : 'Create New Quotation'}
              </h1>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: formData.quotationType === 'Only Hotel' ? 'var(--bg-ECFDF5)' : (formData.quotationType === 'Events / Corporate' ? 'var(--bg-FDF4FF)' : 'var(--bg-E0F2FE)'),
                  color: formData.quotationType === 'Only Hotel' ? 'var(--fg-047857)' : (formData.quotationType === 'Events / Corporate' ? 'var(--fg-A21CAF)' : 'var(--fg-0369A1)'),
                  border: '1px solid currentColor'
                }}
              >
                {formData.quotationType || 'Package'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--fg-94A3B8)', marginTop: '2px' }}>
              {formData.destination || 'Destination'} • {formData.clientName || 'Valued Guest'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => printQuotation('quotation-live-render-view')}
            className="btn btn-outline btn-sm"
            disabled={!can('quotations', 'canDownload')}
            title={can('quotations', 'canDownload') ? undefined : 'You do not have the Download right, so printing is not available'}
          >
            <Printer size={14} />
            <span>Print Preview</span>
          </button>
          <button
            onClick={() => handleSave(false)}
            className="btn btn-primary btn-sm"
            disabled={saving || Boolean(formData.confirmationId)}
            title={formData.confirmationId ? 'Confirmed quotations are locked' : undefined}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : formData.confirmationId ? <Lock size={14} /> : <Save size={14} />}
            <span>{isEditMode ? 'Save Changes' : 'Save Quotation'}</span>
          </button>
        </div>
      </div>

      {formData.confirmationId && (
        <div className="cf-banner" role="status">
          <Lock size={16} aria-hidden="true" />
          <span>
            This quotation is confirmed as <strong>{formData.confirmationNo}</strong> and is locked, so what was sold cannot change. To change it, cancel the booking first; that unlocks the quotation.
          </span>
          {can('confirmations', 'canRead') && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/confirmations/${formData.confirmationId}`)}>
              Open the booking
            </button>
          )}
        </div>
      )}

      {/* Main Grid: Form Builder on Left, Live PDF Preview on Right */}
      <div className="rs-builder-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(440px, 1.25fr) minmax(380px, 1fr)', gap: '24px' }}>
        {/* LEFT: Tabbed Form Controls */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Navigation Tabs Bar (6 Separate Steps) */}
          <div
            className="builder-tabs"
            style={{
              display: 'flex',
              gap: '4px',
              padding: '4px',
              borderRadius: '10px',
              border: '1px solid var(--border-subtle)',
              overflowX: 'auto'
            }}
          >
            {tabsFor(formData).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '5px',
                    padding: '8px 8px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: isActive ? 700 : 500,
                    backgroundColor: isActive ? 'rgba(14, 165, 233, 0.18)' : 'transparent',
                    color: isActive ? 'var(--fg-0369A1)' : 'var(--fg-667085)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Icon size={14} color={isActive ? '#0ea5e9' : '#94a3b8'} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW, CLIENT & QUOTATION TYPE */}
          {activeTab === 'overview' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Type of Quotation Selector Card */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(2, 132, 199, 0.06)',
                  border: '1.5px solid #0284c7',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--fg-0369A1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={16} />
                  <span>Select Type of Quotation *</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                  {QUOTATION_TYPES.map(opt => {
                    const isSelected = (formData.quotationType || 'Package') === opt.value;
                    const Icon = opt.value === 'Only Hotel' ? Hotel : opt.value === 'Events / Corporate' ? Briefcase : opt.value === 'Land Service' ? Car : opt.value === 'Visa' ? FileCheck : Luggage;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setFormData(prev => {
                            const next = {
                              ...prev,
                              quotationType: opt.value,
                              destination: prev.destination || (opt.value === 'Only Hotel' ? 'LUXURY HOTEL BOOKING' : ''),
                              // A land service starts with one vehicle line and the standard inclusions (nothing typed is replaced).
                              ...(opt.value === 'Land Service' ? startLandService(prev) : {}),
                              // A visa starts with a visa fee and a service charge to fill in; the documents checklist starts empty.
                              ...(opt.value === 'Visa' ? startVisa(prev) : {}),
                              // A hotel quotation starts with two options (Option 1, Option 2), each able to take several hotels.
                              ...(opt.value === 'Only Hotel' ? startHotelOptions(prev) : {})
                            };
                            // A hotel (the sheet) or a package (per room per night) starts with its pricing tables: Option 1 and Option 2.
                            return { ...next, ...startPricingFor(next, opt.value) };
                          });
                          // Go back to the first tab when the one being looked at does not exist for the new type.
                          if (!tabsFor({ quotationType: opt.value }).some((t) => t.id === activeTab)) setActiveTab('overview');
                          showToast(`Quotation format switched to ${opt.value}`, 'info');
                        }}
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #0284c7' : '1px solid var(--bd-CBD5E1)',
                          backgroundColor: isSelected ? 'var(--bg-E0F2FE)' : 'var(--bg-FFFFFF)',
                          color: isSelected ? 'var(--fg-0369A1)' : 'var(--fg-334155)',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          textAlign: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <Icon size={18} color={isSelected ? '#0284c7' : '#64748b'} />
                        <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{opt.label}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--fg-64748B)' }}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional: Link to Existing Inquiry */}
              <div className="form-group" style={{ padding: '12px', borderRadius: '10px', border: '1px solid rgba(14, 165, 233, 0.2)' }}>
                <label className="form-label" style={{ color: 'var(--fg-0369A1)' }}>
                  Auto-fill from Guest Inquiry (Optional)
                </label>
                <select
                  className="form-select"
                  value={formData.guestId || ''}
                  onChange={(e) => {
                    const found = guestsList.find(g => g._id === e.target.value);
                    if (found) handleGuestSelect(found);
                  }}
                >
                  <option value="">-- Choose an inquiry to auto-fill --</option>
                  {guestsList.map(g => (
                    <option key={g._id} value={g._id}>
                      [{g.srNo}] {g.guestNames} - {g.destination} ({g.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination & Duration */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">
                    {formData.quotationType === 'Only Hotel' ? 'Hotel / City Title *' : isLandService(formData) ? 'Trip / Route Title *' : isVisa(formData) ? 'Visa Title *' : 'Package Title / Destination *'}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.destination}
                    onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                    placeholder={formData.quotationType === 'Only Hotel' ? 'e.g. TAJ LAKE PALACE, UDAIPUR' : isLandService(formData) ? 'e.g. DELHI - AGRA - JAIPUR BY SUV' : isVisa(formData) ? 'e.g. UNITED ARAB EMIRATES TOURIST VISA' : 'e.g. VARANASI & AYODHYA'}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Duration / Nights</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="e.g. 3 Nights / 4 Days"
                  />
                </div>
              </div>

              {/* Client Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Client Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    placeholder="e.g. Dr. Sameer Kapadia"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Pax Breakdown</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.paxDetails}
                    onChange={(e) => {
                      const newPax = e.target.value;
                      setFormData(prev => {
                        const updated = { ...prev, paxDetails: newPax };
                        updated.pricing = recalculatePricing(prev.pricing?.items || DEFAULT_PRICING_ITEMS, newPax, prev.pricing);
                        if (prev.options?.length) updated.options = repriceOptions(prev.options, newPax); // option totals follow the guests
                        Object.assign(updated, followGuests(prev, newPax)); // a visa's applicants follow the guests until set by hand
                        return updated;
                      });
                    }}
                    placeholder="e.g. 3 Adults"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Travel Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={toInputDate(formData.travelDate)}
                    onChange={(e) => setFormData({ ...formData, travelDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Valid Until</label>
                  <input
                    type="date"
                    className="form-input"
                    value={toInputDate(formData.validUntil)}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    {QUOTATION_STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Team Assignment */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Sales Representative</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.sales}
                    onChange={(e) => setFormData({ ...formData, sales: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Ops Executive</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.ops}
                    onChange={(e) => setFormData({ ...formData, ops: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ITINERARY PLANNER */}
          {activeTab === 'itinerary' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                  {formData.quotationType === 'Events / Corporate' ? 'Event & Schedule Itinerary' : 'Day-by-Day Tour Itinerary'} ({formData.itinerary?.length || 0} Days)
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {can('itineraries', 'canRead') && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="btn btn-outline btn-sm"
                      title="Copy a saved itinerary from the library into this quotation"
                    >
                      <BookOpen size={14} />
                      <span>Insert from library</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddDay}
                    className="btn btn-outline-azure btn-sm"
                  >
                    <Plus size={14} />
                    <span>Add Day</span>
                  </button>
                </div>
              </div>

              {formData.quotationType === 'Only Hotel' && (
                <div style={{ fontSize: '0.78rem', color: 'var(--fg-0369A1)', background: 'var(--bg-E0F2FE)', padding: '8px 12px', borderRadius: '6px' }}>
                  ℹ️ Note: For &quot;Only Hotel&quot; quotations, day-wise tour itinerary is optional. You can skip directly to Hotel Details and Pricing.
                </div>
              )}

              {(!formData.itinerary || formData.itinerary.length === 0) ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '36px 16px',
                    borderRadius: '12px',
                    border: '1px dashed var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <Calendar size={36} style={{ color: 'var(--fg-0EA5E9)', opacity: 0.8 }} />
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                    No Itinerary Days Added Yet
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '340px' }}>
                    Add Day 01 and write the plan yourself{can('itineraries', 'canRead') ? ', or copy a ready-made itinerary from the library' : ''}.
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={handleAddDay}
                      className="btn btn-primary btn-sm"
                    >
                      <Plus size={14} />
                      <span>Add Day 01</span>
                    </button>
                    {can('itineraries', 'canRead') && (
                      <button type="button" onClick={() => setPickerOpen(true)} className="btn btn-outline btn-sm">
                        <BookOpen size={14} />
                        <span>Insert from library</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {formData.itinerary.map((day, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        backgroundColor: 'var(--bg-F8FAFC)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ width: '90px', fontWeight: 700, color: 'var(--fg-0284C7)' }}
                            value={day.dayNumber}
                            onChange={(e) => handleUpdateDay(idx, 'dayNumber', e.target.value)}
                            placeholder="Day 01"
                          />
                          <input
                            type="text"
                            className="form-input"
                            style={{ flex: 1, fontWeight: 600 }}
                            value={day.title}
                            onChange={(e) => handleUpdateDay(idx, 'title', e.target.value)}
                            placeholder="Day Title, e.g. Arrival & Local Sightseeing"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDay(idx)}
                          className="btn btn-danger btn-sm btn-icon"
                          title="Delete Day"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: '1 1 180px' }}
                          value={day.stay || ''}
                          maxLength={120}
                          onChange={(e) => handleUpdateDay(idx, 'stay', e.target.value)}
                          placeholder="Overnight stay (optional), e.g. Ubud"
                          aria-label={`Overnight stay for ${day.dayNumber || `Day ${idx + 1}`}`}
                        />
                        <input
                          type="text"
                          className="form-input"
                          style={{ flex: '1 1 180px' }}
                          value={day.meals || ''}
                          maxLength={120}
                          onChange={(e) => handleUpdateDay(idx, 'meals', e.target.value)}
                          placeholder="Meals (optional), e.g. Breakfast, Dinner"
                          aria-label={`Meals for ${day.dayNumber || `Day ${idx + 1}`}`}
                        />
                      </div>

                      <LazyRichTextEditor
                        value={day.description || ''}
                        onChange={(description) => handleUpdateDay(idx, 'description', description)}
                        maxLength={20000}
                        minHeight={110}
                        ariaLabel={`Description of ${day.dayNumber || `Day ${idx + 1}`}`}
                        placeholder="Enter detailed day activities, pickup timings, visits, overnight stay..."
                      />

                      <PhotoGallery
                        photos={day.photos || []}
                        onChange={(photos) => handleUpdateDay(idx, 'photos', photos)}
                        purpose="quotation"
                        max={6}
                        label={`Photos for ${day.dayNumber || `Day ${idx + 1}`}`}
                        help="Shown with this day in the quotation and its PDF."
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* End of the Tour Conclusion Banner */}
              <div
                style={{
                  marginTop: '12px',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  border: '1px solid rgba(14, 165, 233, 0.3)',
                  background: 'rgba(14, 165, 233, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.825rem', fontWeight: 700, color: 'var(--fg-0284C7)' }}>
                  <Sparkles size={15} />
                  <span>End of Tour / Event Conclusion Banner</span>
                </div>
                <FormattedLine
                  value={formData.endOfTourNote || '***End of the Tour***'}
                  placeholder="e.g. ***End of the Tour***"
                  ariaLabel="End of the tour banner"
                  maxLength={200}
                  onChange={(value) => setFormData((prev) => ({ ...prev, endOfTourNote: value }))}
                />
              </div>
            </div>
          )}

          {/* TAB 3: HOTELS & ACCOMMODATIONS (NEW FORMAT) */}
          {/* TAB 3 for a land service: the vehicles, their rates and what they include (no hotels) */}
          {activeTab === 'package' && isLandService(formData) && (
            <div className="animate-fade-in">
              <VehiclesEditor quotation={formData} onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))} />
            </div>
          )}

          {/* The two tabs of a visa quotation: the visa with its documents checklist, and the fees */}
          {(activeTab === 'visa' || activeTab === 'visaFees') && isVisa(formData) && (
            <div className="animate-fade-in">
              {activeTab === 'visa' && can('visas', 'canRead') && (
                <div className="cf-banner" role="note" style={{ marginBottom: 16 }}>
                  <span>Saved the visa in the Visa List? Pick it to fill the details, the documents checklist, the usual fees and the inclusions.</span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setVisaPickerOpen(true)}>Choose from the visa list</button>
                </div>
              )}
              {activeTab === 'visa' && can('visas', 'canCreate') && <SaveVisaToList quotation={formData} />}
              <VisaEditor quotation={formData} section={activeTab === 'visa' ? 'details' : 'fees'} onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))} />
            </div>
          )}

          {activeTab === 'package' && !isLandService(formData) && !isVisa(formData) && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Hotel options: several choices, each with its own hotels and its own price */}
              {(formData.options || []).length > 0 && (
                <OptionsEditor
                  options={formData.options}
                  onChange={(options) => setFormData((prev) => ({ ...prev, options }))}
                  paxDetails={formData.paxDetails}
                  quotationType={formData.quotationType}
                  pricedByTables={usesPriceTables(formData)}
                  canUseList={can('hotels', 'canRead')}
                  onChooseHotel={(option, hotel) => setHotelPicker({ option, hotel })}
                  onSingle={handleSingleOffer}
                />
              )}

              {/* Hotels Section (a single offer) */}
              {(formData.options || []).length === 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--fg-0F172A)' }}>
                      Accommodations & Hotel Stays ({formData.packageDetails?.hotels?.length || 0})
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--fg-64748B)' }}>
                      {formData.quotationType === 'Only Hotel'
                        ? 'A hotel quotation uses hotels from your hotel list, with their photos and details.'
                        : 'Add hotels with room category, meal plans, check-in/out dates, and star rating.'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {can('hotels', 'canRead') && (
                      <button type="button" onClick={() => setHotelPicker({ mode: 'new' })} className="btn btn-primary btn-sm" title="Take a hotel from your hotel list">
                        <Hotel size={14} />
                        <span>Choose from hotel list</span>
                      </button>
                    )}
                    {formData.quotationType !== 'Only Hotel' && (
                      <button
                        type="button"
                        onClick={handleAddHotel}
                        className="btn btn-outline-azure btn-sm"
                      >
                        <Plus size={14} />
                        <span>Add Hotel Stay</span>
                      </button>
                    )}
                    <button type="button" onClick={handleStartOptions} className="btn btn-outline btn-sm" title="Offer the guest several hotel choices, each with its own price">
                      <Layers size={14} />
                      <span>Offer hotel options</span>
                    </button>
                  </div>
                </div>

                {(!formData.packageDetails?.hotels || formData.packageDetails.hotels.length === 0) ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '28px 16px',
                      borderRadius: '10px',
                      border: '1px dashed var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Building2 size={32} style={{ color: 'var(--fg-0EA5E9)', opacity: 0.8 }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                      No Accommodations Added
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '360px' }}>
                      {formData.quotationType === 'Only Hotel'
                        ? 'Choose the hotel from your hotel list. If it is new, add it to the list from the same window.'
                        : 'Take a hotel from your hotel list, or add a stay by hand with its room categories and meal plans.'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {can('hotels', 'canRead') ? (
                        <button type="button" onClick={() => setHotelPicker({ mode: 'new' })} className="btn btn-primary btn-sm">
                          <Hotel size={13} />
                          <span>Choose from hotel list</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>You do not have permission to open the hotel list.</span>
                      )}
                      {formData.quotationType !== 'Only Hotel' && (
                        <button
                          type="button"
                          onClick={handleAddHotel}
                          className="btn btn-outline-azure btn-sm"
                        >
                          <Plus size={13} />
                          <span>Add Hotel Stay</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {formData.packageDetails.hotels.map((h, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'var(--bg-F8FAFC)',
                          border: '1px solid var(--bd-CBD5E1)',
                          borderRadius: '10px',
                          padding: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                        }}
                      >
                        {/* Where this stay came from */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
                          {h.hotelId ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--fg-047857)', fontWeight: 700 }}>
                              <CheckCircle2 size={14} aria-hidden="true" /> From the hotel list: its details and photos are copied here and can be changed
                            </span>
                          ) : (
                            <span style={{ color: 'var(--fg-64748B)' }}>Typed by hand</span>
                          )}
                          {can('hotels', 'canRead') && (
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setHotelPicker({ index: idx })}>
                              <Hotel size={13} />
                              <span>{h.hotelId ? 'Change hotel' : 'Choose from hotel list'}</span>
                            </button>
                          )}
                        </div>

                        {/* Row 1: City, Hotel Name, Star Rating, Nights, Delete */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 2fr 1fr 1fr 36px',
                            gap: '8px',
                            alignItems: 'center'
                          }}
                        >
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>City / Destination</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="e.g. Varanasi"
                              value={h.city || ''}
                              readOnly={formData.quotationType === 'Only Hotel' && Boolean(h.hotelId)}
                              onChange={(e) => handleUpdateHotel(idx, 'city', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Hotel Name</label>
                            <input
                              type="text"
                              className="form-input"
                              style={{ fontWeight: 700 }}
                              placeholder="e.g. Hotel Rivatas"
                              value={h.hotelName || ''}
                              readOnly={formData.quotationType === 'Only Hotel' && Boolean(h.hotelId)}
                              title={formData.quotationType === 'Only Hotel' && h.hotelId ? 'Use "Change hotel" to pick a different hotel' : undefined}
                              onChange={(e) => handleUpdateHotel(idx, 'hotelName', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Star Rating</label>
                            <select
                              className="form-select"
                              value={h.starRating || '4 star'}
                              disabled={formData.quotationType === 'Only Hotel' && Boolean(h.hotelId)}
                              onChange={(e) => handleUpdateHotel(idx, 'starRating', e.target.value)}
                            >
                              {HOTEL_STAR_RATINGS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Nights Duration</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="e.g. 2 Nights"
                              value={h.nights || ''}
                              onChange={(e) => handleUpdateHotel(idx, 'nights', e.target.value)}
                            />
                          </div>
                          <div style={{ alignSelf: 'flex-end', paddingBottom: '2px' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveHotel(idx)}
                              className="btn btn-danger btn-sm btn-icon"
                              title="Remove Hotel"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Row 2: Room Category, Meal Plan, Check-In, Check-Out, No of Rooms */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.1fr 1fr ', gap: '8px' }}>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Room Category / Type</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="e.g. Deluxe Room / Suite"
                              value={h.roomCategory || ''}
                              list={`stay-rooms-${idx}`}
                              onChange={(e) => handleUpdateHotel(idx, 'roomCategory', e.target.value)}
                            />
                            <datalist id={`stay-rooms-${idx}`}>
                              {(h.roomOptions || []).map((room) => (
                                <option key={room} value={room} />
                              ))}
                            </datalist>
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Meal Plan</label>
                            <select
                              className="form-select"
                              value={h.mealPlan || 'CP (Breakfast Only)'}
                              onChange={(e) => handleUpdateHotel(idx, 'mealPlan', e.target.value)}
                            >
                              {MEAL_PLANS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>No. of Rooms</label>
                            <input
                              type="text"
                              className="form-input"
                              placeholder="e.g. 2 Rooms"
                              value={h.noOfRooms || ''}
                              onChange={(e) => handleUpdateHotel(idx, 'noOfRooms', e.target.value)}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 1.2fr', gap: '8px' }}>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Check-in Date</label>
                            <input
                              type="date"
                              className="form-input"
                              value={toInputDate(h.checkInDate)}
                              onChange={(e) => handleUpdateHotel(idx, 'checkInDate', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="form-label" style={{ fontSize: '0.7rem' }}>Check-out Date</label>
                            <input
                              type="date"
                              className="form-input"
                              value={toInputDate(h.checkOutDate)}
                              onChange={(e) => handleUpdateHotel(idx, 'checkOutDate', e.target.value)}
                            />
                          </div>
                        </div>

                        {/* Row 3: Hotel Address and Contact Details */}
                        < div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 1.2fr', gap: '8px' }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: '0.8rem' }}
                            placeholder="Hotel Address (e.g. Near The Mall, Alkapuri)"
                            value={h.address || ''}
                            onChange={(e) => handleUpdateHotel(idx, 'address', e.target.value)}
                          />
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: '0.8rem' }}
                            placeholder="Phone / Desk Contact"
                            value={h.contactNumber || ''}
                            onChange={(e) => handleUpdateHotel(idx, 'contactNumber', e.target.value)}
                          />
                          <input
                            type="text"
                            className="form-input"
                            style={{ fontSize: '0.8rem' }}
                            placeholder="Email / Contact Person"
                            value={h.email || h.contactPerson || ''}
                            onChange={(e) => {
                              handleUpdateHotel(idx, 'email', e.target.value);
                              handleUpdateHotel(idx, 'contactPerson', e.target.value);
                            }}
                          />
                        </div>

                        {/* What the hotel quotation shows besides the basics: photos, amenities, check-in / check-out times */}
                        <details className="stay-more" open={Boolean(h.photos?.length || h.amenities?.length)}>
                          <summary>
                            Photos, amenities and times ({h.photos?.length || 0} {(h.photos?.length || 0) === 1 ? 'photo' : 'photos'}, {h.amenities?.length || 0} {(h.amenities?.length || 0) === 1 ? 'amenity' : 'amenities'})
                          </summary>
                          <div className="stay-more-body">
                            <PhotoGallery
                              photos={h.photos || []}
                              onChange={(photos) => handleUpdateHotel(idx, 'photos', photos)}
                              purpose="quotation"
                              max={6}
                              label={`Photos of ${h.hotelName || `hotel stay ${idx + 1}`}`}
                              help="Shown with this hotel in the quotation and its PDF. The first photo is the large one."
                            />
                            <div>
                              <span className="form-label">Amenities</span>
                              <TagInput
                                tags={h.amenities || []}
                                onChange={(amenities) => handleUpdateHotel(idx, 'amenities', amenities)}
                                rules={AMENITY_RULES}
                                label={`Add an amenity to hotel stay ${idx + 1}`}
                                removeLabel="Remove amenity"
                                placeholder="e.g. Swimming pool, Free WiFi"
                              />
                            </div>
                            <div className="stay-times">
                              <div>
                                <label className="form-label" htmlFor={`stay-in-${idx}`}>Check-in time</label>
                                <input id={`stay-in-${idx}`} type="time" className="form-input" value={h.checkInTime || ''} onChange={(e) => handleUpdateHotel(idx, 'checkInTime', e.target.value)} />
                              </div>
                              <div>
                                <label className="form-label" htmlFor={`stay-out-${idx}`}>Check-out time</label>
                                <input id={`stay-out-${idx}`} type="time" className="form-input" value={h.checkOutTime || ''} onChange={(e) => handleUpdateHotel(idx, 'checkOutTime', e.target.value)} />
                              </div>
                            </div>
                          </div>
                        </details>
                      </div>
                    ))}
                  </div>
                )}

                <div className="form-group" style={{ marginTop: '14px' }}>
                  <label className="form-label">General Room Allocation Info</label>
                  <FormattedLine
                    value={formData.packageDetails?.roomInfo || ''}
                    placeholder="e.g. 2 Double Rooms + 1 Extra Mattress"
                    ariaLabel="General room allocation info"
                    maxLength={300}
                    onChange={(value) => setFormData((prev) => ({ ...prev, packageDetails: { ...prev.packageDetails, roomInfo: value } }))}
                  />
                </div>
              </div>
              )}

              {/* Inclusions */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    Inclusions (✓ Checkmark List)
                  </div>
                  <button
                    type="button"
                    onClick={handleAddInclusion}
                    className="btn btn-outline-azure btn-sm"
                  >
                    <Plus size={14} />
                    <span>Add Inclusion</span>
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(formData.packageDetails?.inclusions || []).map((inc, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--fg-10B981)', fontWeight: 800 }}>✓</span>
                      <FormattedLine
                        value={inc}
                        placeholder="Inclusion item..."
                        ariaLabel={`Inclusion ${idx + 1}`}
                        onChange={(value) => handleUpdateInclusion(idx, value)}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveInclusion(idx)}
                        className="btn btn-danger btn-sm btn-icon"
                        title="Remove Inclusion"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: FLIGHT DETAILS */}
          {activeTab === 'flights' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Flight Tickets & Route Configuration
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Configure airline segments or toggle &apos;As per flight ticket&apos; mode
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => printFlightVoucher(formData)}
                    disabled={!can('quotations', 'canDownload')}
                    className="btn btn-secondary btn-sm"
                    title={can('quotations', 'canDownload') ? 'Print Flight Voucher' : 'You do not have the Download right, so printing is not available'}
                  >
                    <Printer size={14} />
                    <span>Print Voucher</span>
                  </button>

                  {!formData.asPerFlightTicket && (
                    <button
                      type="button"
                      onClick={handleAddFlight}
                      className="btn btn-outline-azure btn-sm"
                    >
                      <Plus size={14} />
                      <span>Add Segment</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Mode Toggle */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plane size={15} style={{ color: 'var(--fg-0EA5E9)' }} />
                    <span>Flight Presentation Mode</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, asPerFlightTicket: false })}
                    className={`btn btn-sm ${!formData.asPerFlightTicket ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    Route Cards ({formData.flightDetails?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, asPerFlightTicket: true })}
                    className={`btn btn-sm ${formData.asPerFlightTicket ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    As Per Flight Ticket
                  </button>
                </div>
              </div>

              {formData.asPerFlightTicket ? (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(2, 132, 199, 0.06)',
                    border: '1.5px solid #0284c7',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <label className="form-label" style={{ fontWeight: 700, color: 'var(--fg-0284C7)' }}>
                    Flight Ticket Statement & Notes to Guest
                  </label>
                  <LazyRichTextEditor
                    value={formData.flightTicketNote || ''}
                    onChange={(value) => setFormData((prev) => ({ ...prev, flightTicketNote: value }))}
                    maxLength={500}
                    minHeight={80}
                    ariaLabel="Flight ticket statement and notes to guest"
                    placeholder="Flight details will be as per confirmed flight ticket."
                  />
                  <div className="form-group" style={{ marginTop: '6px' }}>
                    <label className="form-label">Flight Ticket Document / URL (Optional)</label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://drive.google.com/file/... or URL to PDF"
                      value={formData.flightTicketUrl || ''}
                      onChange={(e) => setFormData({ ...formData, flightTicketUrl: e.target.value })}
                    />
                  </div>
                </div>
              ) : (
                (!formData.flightDetails || formData.flightDetails.length === 0) ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '30px 16px',
                      borderRadius: '10px',
                      border: '1px dashed var(--border-subtle)',
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    No flight segments added. Click &apos;Add Segment&apos; or switch to &apos;As per flight ticket&apos; mode.
                  </div>
                ) : (
                  formData.flightDetails.map((f, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-F8FAFC)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: 'var(--fg-0284C7)', fontSize: '0.85rem' }}>
                          Flight #{idx + 1}: {f.flightType || 'Segment'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFlight(idx)}
                          className="btn btn-danger btn-sm btn-icon"
                          title="Delete Flight"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        <div>
                          <label className="form-label">Flight Type</label>
                          <select
                            className="form-select"
                            value={f.flightType}
                            onChange={(e) => handleUpdateFlight(idx, 'flightType', e.target.value)}
                          >
                            {FLIGHT_TYPES.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Airline Name</label>
                          <input
                            type="text"
                            className="form-input"
                            value={f.airline}
                            placeholder="e.g. Indigo"
                            onChange={(e) => handleUpdateFlight(idx, 'airline', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="form-label">Flight Number</label>
                          <input
                            type="text"
                            className="form-input"
                            value={f.flightNumber}
                            placeholder="e.g. 6E 6805"
                            onChange={(e) => handleUpdateFlight(idx, 'flightNumber', e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label className="form-label">Departure Airport</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. AMD - Ahmedabad"
                            value={f.fromAirport}
                            onChange={(e) => handleUpdateFlight(idx, 'fromAirport', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="form-label">Arrival Airport</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g. VNS - Varanasi"
                            value={f.toAirport}
                            onChange={(e) => handleUpdateFlight(idx, 'toAirport', e.target.value)}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px' }}>
                        <div>
                          <label className="form-label">Dep. Date</label>
                          <input
                            type="date"
                            className="form-input"
                            value={toInputDate(f.depDate || f.departureDate)}
                            onChange={(e) => {
                              handleUpdateFlight(idx, 'depDate', e.target.value);
                              handleUpdateFlight(idx, 'departureDate', e.target.value);
                            }}
                          />
                        </div>
                        <div>
                          <label className="form-label">Arr. Date</label>
                          <input
                            type="date"
                            className="form-input"
                            value={toInputDate(f.arrDate)}
                            onChange={(e) => handleUpdateFlight(idx, 'arrDate', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="form-label">Dep. Time</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="11:20"
                            value={f.depTime}
                            onChange={(e) => handleUpdateFlight(idx, 'depTime', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="form-label">Arr. Time</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="13:10"
                            value={f.arrTime}
                            onChange={(e) => handleUpdateFlight(idx, 'arrTime', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="form-label">Duration</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="01H:50M"
                            value={f.duration}
                            onChange={(e) => handleUpdateFlight(idx, 'duration', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          )}

          {/* TAB 5: DEDICATED SEPARATE PRICING PAGE / TABS */}
          {/* A quotation that was already priced with the pricing table keeps it, with a way back to the usual price list. */}
          {activeTab === 'pricing' && usesPriceTables(formData) && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="cf-banner" role="note">
                <span>
                  {askUsualList
                    ? 'Remove the pricing table and the amounts typed in it, and use the usual price list instead?'
                    : formData.quotationType === 'Only Hotel'
                      ? 'This hotel quotation is priced with the pricing sheet: one table for each option (for example the 3 star and the 4 star hotels you chose on the Hotel Details tab), with Package, Airfare, Visa and TCS for each kind of traveller. The totals are counted for you.'
                      : 'This package is priced per room per night: one table for each option (for example a 3 star and a 4 star package), with the nights, the rooms and the total counted for you. Your trip\'s nights are used unless you type them.'}
                </span>
                {askUsualList ? (
                  <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        setAskUsualList(false);
                        setFormData((prev) => ({ ...prev, priceTables: [] }));
                        showToast('The pricing table was removed. This quotation now uses the usual price list.', 'info');
                      }}
                    >
                      Yes, use the usual list
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setAskUsualList(false)}>
                      No, keep the table
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setAskUsualList(true)}>
                    Use the usual price list
                  </button>
                )}
              </div>
              <PriceTablesEditor tables={tablesOf(formData)} quotation={formData} onChange={(mine) => setFormData((prev) => ({ ...prev, priceTables: withTables(prev, mine) }))} />
            </div>
          )}

          {activeTab === 'pricing' && !usesPriceTables(formData) && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* A hotel or package quotation made before the pricing tables came back keeps its per-person price list, with a way to the tables. */}
              {layoutOf(formData) && (
                <div className="cf-banner" role="note">
                  <span>
                    {askTables
                      ? 'Use the pricing table instead? The per-person prices typed here, and the prices typed under the hotel options, are removed.'
                      : formData.quotationType === 'Only Hotel'
                        ? 'This hotel quotation uses the per-person price list. The pricing sheet (Option 1 and Option 2, with Package, Airfare, Visa and TCS for each kind of traveller) is the usual way to price a hotel quotation.'
                        : 'This package uses the per-person price list. The pricing table (per room per night, with the nights, the rooms and the total counted for you) is the usual way to price a package.'}
                  </span>
                  {askTables ? (
                    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-danger btn-sm" onClick={switchToPricingTables}>
                        Yes, use the pricing table
                      </button>
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => setAskTables(false)}>
                        No, keep the list
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setAskTables(true)}>
                      Use the pricing table
                    </button>
                  )}
                </div>
              )}

              {(formData.options || []).length > 0 && (
                <div className="cf-banner" role="note">
                  <span>{formData.quotationType === 'Only Hotel'
                    ? 'This quotation offers hotel options, so each hotel is priced in its own rate table under the options (per room per night, nights and rooms; the Grand Total of each option is counted from them). This price list is for a quotation with a single offer.'
                    : 'This quotation offers hotel options, so each option is priced under its own hotels (price per person; the total is counted from the guests). This price list is for a quotation with a single offer.'}</span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveTab('package')}>
                    Go to the hotel options
                  </button>
                </div>
              )}

              {/* Header & Add-on Button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--fg-0F172A)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Receipt size={18} style={{ color: 'var(--fg-0284C7)' }} />
                    <span>Pricing Management & Cost Breakdown</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--fg-64748B)' }}>
                    Configure Package Price, Airfare, Other, dynamic Add-ons and view live Grand Totals.
                  </div>
                </div>

                {/* + Add On Button */}
                <button
                  type="button"
                  onClick={handleAddPricingItem}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <PlusCircle size={15} />
                  <span>+ Add On</span>
                </button>
              </div>

              {/* Buttons / Tabs Under Pricing */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  padding: '6px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-F1F5F9)',
                  border: '1px solid var(--bd-CBD5E1)',
                  overflowX: 'auto',
                  alignItems: 'center'
                }}
              >
                {currentPricingItems.map((item) => {
                  const isActive = pricingActiveTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPricingActiveTab(item.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: isActive ? '1px solid #0284c7' : '1px solid transparent',
                        backgroundColor: isActive ? '#0284c7' : 'var(--bg-FFFFFF)',
                        color: isActive ? '#ffffff' : 'var(--fg-334155)',
                        fontWeight: isActive ? 700 : 600,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: isActive ? '0 2px 6px rgba(2, 132, 199, 0.3)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{item.name}</span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-E2E8F0)',
                          color: isActive ? '#ffffff' : 'var(--fg-475569)'
                        }}
                      >
                        ₹{item.costPerPerson || 0}
                      </span>
                    </button>
                  );
                })}

                {/* Total Tab Button */}
                <button
                  type="button"
                  onClick={() => setPricingActiveTab('total')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: pricingActiveTab === 'total' ? '1.5px solid #059669' : '1px solid #10b981',
                    backgroundColor: pricingActiveTab === 'total' ? '#059669' : 'var(--bg-ECFDF5)',
                    color: pricingActiveTab === 'total' ? '#ffffff' : 'var(--fg-047857)',
                    fontWeight: 800,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    marginLeft: 'auto',
                    whiteSpace: 'nowrap',
                    boxShadow: pricingActiveTab === 'total' ? '0 2px 8px rgba(5, 150, 105, 0.3)' : 'none'
                  }}
                >
                  <span>📊 Total</span>
                  <span>₹{formData.pricing?.totalCostPerPerson || 0}/pax</span>
                </button>
              </div>

              {/* SUBTAB CONTENT: Specific Pricing Component or Total */}
              {pricingActiveTab !== 'total' ? (
                (() => {
                  const itemIndex = currentPricingItems.findIndex(i => i.id === pricingActiveTab);
                  const item = currentPricingItems[itemIndex] || currentPricingItems[0];
                  if (!item) return null;
                  const currentIndex = itemIndex >= 0 ? itemIndex : 0;
                  const isPreset = item.id === 'pkg' || item.id === 'air' || item.id === 'oth';

                  return (
                    <div
                      style={{
                        padding: '18px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--bg-F8FAFC)',
                        border: '1.5px solid #0284c7',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, color: 'var(--fg-0284C7)', fontSize: '0.95rem' }}>
                            Component: {item.name}
                          </span>
                          {!isPreset && (
                            <span className="badge badge-azure" style={{ fontSize: '0.7rem' }}>Custom Add-on</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {/* Remove button for custom add-ons */}
                          {!isPreset && (
                            <button
                              type="button"
                              onClick={() => handleRemovePricingItem(currentIndex)}
                              className="btn btn-danger btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="Delete this pricing component"
                            >
                              <MinusCircle size={14} />
                              <span>Remove Tab</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Component Name (Editable) */}
                      <div className="form-group">
                        <label className="form-label">Pricing Component Title</label>
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontWeight: 700 }}
                          value={item.name}
                          onChange={(e) => handleUpdatePricingItem(currentIndex, 'name', e.target.value)}
                          placeholder="e.g. Package Price / Airfare / Gala Dinner"
                        />
                      </div>

                      {/* Rate and Pax Calculation */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '12px' }}>
                        <div className="form-group">
                          <label className="form-label">Cost Per Person (Rs) *</label>
                          <input
                            type="number"
                            className="form-input"
                            style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--fg-0369A1)' }}
                            value={item.costPerPerson ?? 0}
                            onChange={(e) => handleUpdatePricingItem(currentIndex, 'costPerPerson', Number(e.target.value))}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Pax Multiplier</label>
                          <input
                            type="text"
                            className="form-input"
                            disabled
                            value={`${getPaxNumber(formData.paxDetails)} Pax (${formData.paxDetails || '1 Pax'})`}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Line Total for Group (Rs)</label>
                          <input
                            type="text"
                            className="form-input"
                            disabled
                            style={{ fontWeight: 800, color: 'var(--fg-059669)', background: 'var(--bg-ECFDF5)' }}
                            value={`₹${(item.costPerPerson * getPaxNumber(formData.paxDetails)).toLocaleString('en-IN')}`}
                          />
                        </div>
                      </div>

                      {/* Note and Tax statement */}
                      <div className="form-group">
                        <label className="form-label">Rate Note / Specification</label>
                        <input
                          type="text"
                          className="form-input"
                          value={item.note || ''}
                          onChange={(e) => handleUpdatePricingItem(currentIndex, 'note', e.target.value)}
                          placeholder="e.g. Per person X 3 Adults (Inclusive of GST)"
                        />
                      </div>

                      {/* Included in Grand Total Toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px dashed var(--bd-E2E8F0)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--fg-475569)' }}>
                          Include this component in Grand Total calculation:
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUpdatePricingItem(currentIndex, 'isIncluded', !item.isIncluded)}
                          className={`btn btn-sm ${item.isIncluded !== false ? 'btn-primary' : 'btn-outline'}`}
                          style={{ fontSize: '0.75rem' }}
                        >
                          {item.isIncluded !== false ? '✓ Included in Total' : '✕ Excluded / Optional'}
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* TOTAL TAB CONTENT */
                <div
                  style={{
                    padding: '18px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--bg-F8FAFC)',
                    border: '1.5px solid #10b981',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 800, color: 'var(--fg-047857)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={18} />
                      <span>Consolidated Total & Pricing Summary</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPricingItem}
                      className="btn btn-outline-azure btn-xs"
                    >
                      <Plus size={12} />
                      <span>+ Add More Component</span>
                    </button>
                  </div>

                  {/* Pricing Items Summary Table */}
                  <div style={{ border: '1px solid var(--bd-CBD5E1)', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--bg-FFFFFF)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-F1F5F9)', borderBottom: '1px solid var(--bd-CBD5E1)', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px' }}>Pricing Item</th>
                          <th style={{ padding: '8px 12px' }}>Rate / Pax</th>
                          <th style={{ padding: '8px 12px' }}>Pax</th>
                          <th style={{ padding: '8px 12px' }}>Group Subtotal</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPricingItems.map((item, idx) => (
                          <tr key={item.id} style={{ borderBottom: '1px solid var(--bd-F1F5F9)' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--fg-0F172A)' }}>
                              {item.name}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--fg-0369A1)', fontWeight: 600 }}>
                              ₹{(item.costPerPerson || 0).toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--fg-64748B)' }}>
                              {getPaxNumber(formData.paxDetails)}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--fg-059669)' }}>
                              ₹{((item.costPerPerson || 0) * getPaxNumber(formData.paxDetails)).toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              {item.isIncluded !== false ? (
                                <span style={{ color: 'var(--fg-059669)', fontSize: '0.75rem', fontWeight: 700 }}>✓ Included</span>
                              ) : (
                                <span style={{ color: 'var(--fg-94A3B8)', fontSize: '0.75rem' }}>Optional</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => setPricingActiveTab(item.id)}
                                  className="btn btn-outline btn-xs btn-icon"
                                  title="Edit component"
                                >
                                  ✏️
                                </button>
                                {item.id !== 'pkg' && item.id !== 'air' && item.id !== 'oth' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePricingItem(idx)}
                                    className="btn btn-danger btn-xs btn-icon"
                                    title="Delete component"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Totals Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-FEF08A)', border: '1px solid #facc15' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fg-854D0E)', textTransform: 'uppercase' }}>
                        Total Cost Per Person (Incl GST)
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--fg-0F172A)', marginTop: '2px' }}>
                        ₹{(formData.pricing?.totalCostPerPerson || 0).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--fg-713F12)', marginTop: '2px' }}>
                        {richToPlainText(formData.pricing?.totalCostNote) || 'Rs 0 Per person (Incl of GST)'}
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-ECFDF5)', border: '1px solid var(--bd-A7F3D0)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--fg-065F46)', textTransform: 'uppercase' }}>
                        Grand Total (Group: {formData.paxDetails || '1 Pax'})
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--fg-059669)', marginTop: '2px' }}>
                        ₹{(formData.pricing?.grandTotal || 0).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--fg-047857)', marginTop: '2px' }}>
                        Auto-calculated from all active price tabs
                      </div>
                    </div>
                  </div>

                  {/* Total Cost Highlight Note & Payment Terms */}
                  <div className="form-group">
                    <label className="form-label">Total Banner Note (Printed in Document)</label>
                    <FormattedLine
                      value={formData.pricing?.totalCostNote || ''}
                      placeholder="e.g. Rs 43,000 Per person (Incl of GST)"
                      ariaLabel="Total banner note"
                      maxLength={300}
                      onChange={(value) => setFormData((prev) => ({ ...prev, pricing: { ...prev.pricing, totalCostNote: value } }))}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Payment Terms & Additional Pricing Remarks</label>
                    <LazyRichTextEditor
                      value={formData.pricing?.notes || ''}
                      onChange={(value) => setFormData((prev) => ({ ...prev, pricing: { ...prev.pricing, notes: value } }))}
                      maxLength={1000}
                      minHeight={70}
                      ariaLabel="Payment terms and additional pricing remarks"
                      placeholder="e.g. 50% advance upon confirmation, balance 15 days before travel date."
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: EXCLUSIONS, VEHICLE NOTES & TERMS */}
          {activeTab === 'notes' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Exclusions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 800 }}>×</span>
                    <span>Exclusions (× Points) ({(formData.exclusions || []).length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddExclusion}
                    className="btn btn-outline-danger btn-sm"
                  >
                    <Plus size={14} />
                    <span>Add Exclusion</span>
                  </button>
                </div>

                {(!formData.exclusions || formData.exclusions.length === 0) ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '18px',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-subtle)',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    No exclusions added. Click &apos;Add Exclusion&apos; to specify excluded items.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {formData.exclusions.map((exc, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--fg-EF4444)', fontWeight: 800, minWidth: '14px', textAlign: 'center' }}>×</span>
                        <FormattedLine
                          value={exc}
                          placeholder="e.g. Monument entry fees / personal expenses..."
                          ariaLabel={`Exclusion ${idx + 1}`}
                          onChange={(value) => handleUpdateExclusion(idx, value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveExclusion(idx)}
                          className="btn btn-danger btn-sm btn-icon"
                          title="Remove Exclusion"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Policy */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--fg-0369A1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CreditCard size={15} style={{ color: 'var(--fg-0369A1)' }} />
                    <span>Payment Policy ({(formData.paymentPolicy || []).length})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleResetPaymentPolicy}
                      className="btn btn-outline btn-sm"
                      title="Reset to standard 7Heaven payment policy"
                    >
                      Reset Default
                    </button>
                    <button
                      type="button"
                      onClick={handleAddPaymentPolicy}
                      className="btn btn-outline-azure btn-sm"
                    >
                      <Plus size={14} />
                      <span>Add Policy Point</span>
                    </button>
                  </div>
                </div>

                {(!formData.paymentPolicy || formData.paymentPolicy.length === 0) ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '18px',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-subtle)',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    No payment policies specified. Click &apos;Add Policy Point&apos; or &apos;Reset Default&apos;.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {formData.paymentPolicy.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--fg-0369A1)', fontWeight: 800, minWidth: '14px', textAlign: 'center' }}>•</span>
                        <FormattedLine
                          value={item}
                          placeholder="e.g. 25% Advance token payment at confirmation..."
                          ariaLabel={`Payment policy point ${idx + 1}`}
                          onChange={(value) => handleUpdatePaymentPolicy(idx, value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePaymentPolicy(idx)}
                          className="btn btn-danger btn-sm btn-icon"
                          title="Remove Point"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cancellation Policy */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--fg-F59E0B)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={15} style={{ color: 'var(--fg-F59E0B)' }} />
                    <span>Cancellation Policy ({(formData.cancellationPolicy || []).length})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleResetCancellationPolicy}
                      className="btn btn-outline btn-sm"
                      title="Reset to standard 7Heaven cancellation policy"
                    >
                      Reset Default
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCancellationPolicy}
                      className="btn btn-outline-gold btn-sm"
                    >
                      <Plus size={14} />
                      <span>Add Policy Point</span>
                    </button>
                  </div>
                </div>

                {(!formData.cancellationPolicy || formData.cancellationPolicy.length === 0) ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '18px',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-subtle)',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    No cancellation policies specified. Click &apos;Add Policy Point&apos; or &apos;Reset Default&apos;.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {formData.cancellationPolicy.map((item, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--fg-F59E0B)', fontWeight: 800, minWidth: '14px', textAlign: 'center' }}>⚠️</span>
                        <FormattedLine
                          value={item}
                          placeholder="e.g. 30 days or more prior to departure: 10% cancellation fee..."
                          ariaLabel={`Cancellation policy point ${idx + 1}`}
                          onChange={(value) => handleUpdateCancellationPolicy(idx, value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveCancellationPolicy(idx)}
                          className="btn btn-danger btn-sm btn-icon"
                          title="Remove Point"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Vehicle Guidelines (not for a visa, and not for a hotel quotation: they are not printed there) */}
              {!isVisa(formData) && formData.quotationType !== 'Only Hotel' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--fg-0369A1)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 800 }}>•</span>
                    <span>Vehicle Guidelines (❖ Points) ({(formData.vehicleNotes || []).length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddVehicleNote}
                    className="btn btn-outline-azure btn-sm"
                  >
                    <Plus size={14} />
                    <span>Add Guideline</span>
                  </button>
                </div>

                {(!formData.vehicleNotes || formData.vehicleNotes.length === 0) ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '18px',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-subtle)',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    No vehicle guidelines added.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {formData.vehicleNotes.map((vn, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--fg-0369A1)', fontWeight: 800, minWidth: '14px', textAlign: 'center' }}>❖</span>
                        <FormattedLine
                          value={vn}
                          placeholder="e.g. AC will be switched off in ghat sections..."
                          ariaLabel={`Vehicle note ${idx + 1}`}
                          onChange={(value) => handleUpdateVehicleNote(idx, value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveVehicleNote(idx)}
                          className="btn btn-danger btn-sm btn-icon"
                          title="Remove Guideline"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* Important Notes & Terms */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FileText size={15} style={{ color: '#eab308' }} />
                    <span>Important Notes & Terms ({(formData.importantNotes || []).length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddImportantNote}
                    className="btn btn-outline-azure btn-sm"
                  >
                    <Plus size={14} />
                    <span>Add Note / Term</span>
                  </button>
                </div>

                {(!formData.importantNotes || formData.importantNotes.length === 0) ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '18px',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-subtle)',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)'
                    }}
                  >
                    No important notes added.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {formData.importantNotes.map((note, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--fg-94A3B8)', fontWeight: 700, fontSize: '0.78rem', minWidth: '20px' }}>
                          {idx + 1}.
                        </span>
                        <FormattedLine
                          value={note}
                          placeholder="e.g. Standard check-in 12:00 PM, valid photo ID required..."
                          ariaLabel={`Important note ${idx + 1}`}
                          onChange={(value) => handleUpdateImportantNote(idx, value)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImportantNote(idx)}
                          className="btn btn-danger btn-sm btn-icon"
                          title="Remove Note"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Company Branding & Contact Info */}
              <div style={{ padding: '14px', borderRadius: '10px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-F8FAFC)' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--fg-0F172A)', marginBottom: '8px' }}>
                  7Heaven Company Branding & Contact (Footer Details)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="form-label">Tagline</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.companyDetails?.tagline || 'Travel with the Trust'}
                      onChange={(e) => setFormData({
                        ...formData,
                        companyDetails: { ...formData.companyDetails, tagline: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Description</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.companyDetails?.description || 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings'}
                      onChange={(e) => setFormData({
                        ...formData,
                        companyDetails: { ...formData.companyDetails, description: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Email</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.companyDetails?.email || 'sales@7heaventourism.in'}
                      onChange={(e) => setFormData({
                        ...formData,
                        companyDetails: { ...formData.companyDetails, email: e.target.value }
                      })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                  <div>
                    <label className="form-label">Website</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.companyDetails?.website || 'www.7heaventourism.in'}
                      onChange={(e) => setFormData({
                        ...formData,
                        companyDetails: { ...formData.companyDetails, website: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Phone</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.companyDetails?.phone || '+91 7862829178'}
                      onChange={(e) => setFormData({
                        ...formData,
                        companyDetails: { ...formData.companyDetails, phone: e.target.value }
                      })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', marginTop: '8px' }}>
                  <div>
                    <label className="form-label">Address</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.companyDetails?.address || '405 (FOF) Kanha Capital, Above IDFC bank, Opp Express Tower Hotel, Alkapuri 390007, Vadodara'}
                      onChange={(e) => setFormData({
                        ...formData,
                        companyDetails: { ...formData.companyDetails, address: e.target.value }
                      })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Live Interactive Document Preview */}
        <QuotationLivePreview quotation={formData} />
      </div >

      <VisaPicker
        isOpen={visaPickerOpen}
        onClose={() => setVisaPickerOpen(false)}
        onPick={(visa) => {
          setVisaPickerOpen(false);
          if (hasVisaContent(formData)) setPendingVisa(visa);
          else applyPickedVisa(visa);
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(pendingVisa)}
        onClose={() => setPendingVisa(null)}
        onConfirm={() => {
          applyPickedVisa(pendingVisa);
          setPendingVisa(null);
        }}
        isDanger
        title="Replace what is on this quotation?"
        message={`Using the ${pendingVisa?.country || ''} visa replaces the visa details, the documents checklist, the fees and the inclusions you have typed here. The client, the number of applicants and the notes stay.`}
        confirmText="Replace them"
        cancelText="Keep what I typed"
      />

      <HotelPicker
        isOpen={Boolean(hotelPicker)}
        onClose={() => setHotelPicker(null)}
        onPick={handlePickHotel}
        canAdd={can('hotels', 'canCreate')}
      />

      <ItineraryPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onInsert={handleInsertItinerary}
        currentDayCount={formData.itinerary?.length || 0}
      />
    </div >
  );
};

export default QuotationBuilderPage;
