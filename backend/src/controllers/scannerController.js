import path from 'path';
import { fileURLToPath } from 'url';
import Tesseract from 'tesseract.js';

// eng.traineddata ships in backend/. Pointing the cache there makes OCR work from any working directory and offline.
const OCR_OPTIONS = { cachePath: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') };

// Regex patterns for entity parsing
const EMAIL_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
const PHONE_REGEX = /(?:(?:\+|00)\d{1,4}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5}(?:[-.\s]?\d{1,5})?/g;
const DATE_REGEX = /\b(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}))\b/;

// Comprehensive Destination Knowledge Base
const DESTINATIONS = [
  'Switzerland', 'Swiss', 'Zurich', 'Geneva', 'Zermatt', 'Interlaken', 'Lucerne',
  'Paris', 'France', 'Nice', 'Cannes',
  'Maldives', 'Male',
  'Dubai', 'Abu Dhabi', 'UAE', 'Sharjah',
  'Bali', 'Indonesia', 'Ubud', 'Seminyak',
  'Singapore', 'Sentosa',
  'Kashmir', 'Srinagar', 'Gulmarg', 'Pahalgam',
  'Japan', 'Tokyo', 'Kyoto', 'Osaka',
  'London', 'United Kingdom', 'UK', 'Scotland', 'Edinburgh',
  'Thailand', 'Bangkok', 'Phuket', 'Krabi', 'Koh Samui',
  'Vietnam', 'Hanoi', 'Da Nang', 'Ho Chi Minh',
  'Turkey', 'Istanbul', 'Cappadocia', 'Antalya',
  'Greece', 'Athens', 'Santorini', 'Mykonos',
  'Mauritius', 'Seychelles',
  'Goa', 'Panaji', 'Kerala', 'Kochi', 'Munnar', 'Alleppey',
  'Himachal', 'Manali', 'Shimla', 'Dharamshala',
  'Ladakh', 'Leh',
  'Andaman', 'Port Blair', 'Havelock',
  'Italy', 'Rome', 'Florence', 'Venice', 'Milan', 'Amalfi',
  'Spain', 'Barcelona', 'Madrid', 'Ibiza', 'Mallorca',
  'Iceland', 'Reykjavik',
  'Austria', 'Vienna', 'Salzburg', 'Innsbruck',
  'Germany', 'Munich', 'Berlin', 'Frankfurt',
  'Australia', 'Sydney', 'Melbourne', 'Gold Coast',
  'New Zealand', 'Auckland', 'Queenstown',
  'South Africa', 'Cape Town', 'Johannesburg', 'Kruger',
  'Kenya', 'Nairobi', 'Masai Mara',
  'Egypt', 'Cairo', 'Luxor',
  'Sri Lanka', 'Colombo', 'Kandy', 'Bentota',
  'Nepal', 'Kathmandu', 'Pokhara',
  'Bhutan', 'Paro', 'Thimphu'
];

// Common Company Keywords
const COMPANY_KEYWORDS = [
  'Pvt Ltd', 'Private Limited', 'Ltd', 'LLP', 'Inc', 'Corp', 'Group',
  'Travel', 'Travels', 'Tours', 'Holidays', 'Vacations', 'DMC',
  'Resorts', 'Hotels', 'Hospitality', 'Expeditions', 'Adventures',
  'Agency', 'Concierge', 'Aviation', 'Exports', 'Enterprises',
  'Solutions', 'Services', 'Consulting', 'Tech', 'Technologies'
];

// Common Countries
const COUNTRIES = [
  'India', 'Switzerland', 'France', 'Maldives', 'United Arab Emirates', 'UAE',
  'Indonesia', 'Singapore', 'Japan', 'United Kingdom', 'UK', 'Thailand',
  'Vietnam', 'Turkey', 'Greece', 'Mauritius', 'Seychelles', 'Italy',
  'Spain', 'Iceland', 'Austria', 'Germany', 'Australia', 'New Zealand',
  'South Africa', 'Kenya', 'Egypt', 'Sri Lanka', 'Nepal', 'Bhutan', 'USA'
];

// Helper to clean OCR text
const cleanOCRText = (text) => {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[|│]/g, ' ')
    .trim();
};

export const processScan = async (req, res) => {
  try {
    let rawText = '';
    let scanType = 'card';

    // 1. Check if raw text is passed directly
    if (req.body.text && typeof req.body.text === 'string' && req.body.text.trim()) {
      rawText = req.body.text;
      scanType = req.body.scanType || 'text_input';
    } 
    // 2. Check if a multipart file was uploaded via multer
    else if (req.file && req.file.buffer) {
      scanType = 'file_upload';
      try {
        const ocrResult = await Tesseract.recognize(req.file.buffer, 'eng', OCR_OPTIONS);
        rawText = ocrResult?.data?.text || '';
      } catch (ocrErr) {
        console.error('Tesseract file OCR error:', ocrErr);
        return res.status(200).json({ success: false, message: 'OCR Engine failed to read image: ' + ocrErr.message });
      }
    } 
    // 3. Check if base64 image or dataUrl is in req.body.image
    else if (req.body.image && typeof req.body.image === 'string') {
      scanType = req.body.scanType || 'image_data';
      const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      try {
        const ocrResult = await Tesseract.recognize(imageBuffer, 'eng', OCR_OPTIONS);
        rawText = ocrResult?.data?.text || '';
      } catch (ocrErr) {
        console.error('Tesseract base64 OCR error:', ocrErr);
        return res.status(200).json({ success: false, message: 'OCR Engine failed to read image data: ' + ocrErr.message });
      }
    }

    rawText = cleanOCRText(rawText);

    if (!rawText || rawText.trim().length === 0) {
      return res.status(200).json({
        success: false,
        message: 'No readable text could be recognized from the document. Please ensure the card/image is clear, well-lit, and in focus.'
      });
    }

    const lines = rawText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 1);

    // 1. Extract Email
    const emailMatch = rawText.match(EMAIL_REGEX);
    const email = emailMatch ? emailMatch[1].toLowerCase() : '';

    // 2. Extract Phone Number
    const phoneCandidates = rawText.match(PHONE_REGEX) || [];
    let detectedPhone = '';
    for (const cand of phoneCandidates) {
      const digitsOnly = cand.replace(/\D/g, '');
      if (digitsOnly.length >= 8 && digitsOnly.length <= 15) {
        detectedPhone = cand.trim();
        break;
      }
    }

    // 3. Extract Destination
    let detectedDestination = '';
    for (const dest of DESTINATIONS) {
      if (new RegExp(`\\b${dest}\\b`, 'i').test(rawText)) {
        detectedDestination = dest;
        break;
      }
    }

    // 4. Extract Travel Date if mentioned
    let detectedTravelDate = '';
    const dateMatch = rawText.match(DATE_REGEX);
    if (dateMatch) {
      if (dateMatch[1] && dateMatch[2] && dateMatch[3]) {
        // YYYY-MM-DD
        const y = dateMatch[1];
        const m = String(dateMatch[2]).padStart(2, '0');
        const d = String(dateMatch[3]).padStart(2, '0');
        detectedTravelDate = `${y}-${m}-${d}`;
      } else if (dateMatch[4] && dateMatch[5] && dateMatch[6]) {
        // DD-MM-YYYY
        const d = String(dateMatch[4]).padStart(2, '0');
        const m = String(dateMatch[5]).padStart(2, '0');
        const y = dateMatch[6];
        detectedTravelDate = `${y}-${m}-${d}`;
      }
    }
    if (!detectedTravelDate) {
      detectedTravelDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    // 5. Extract Company Name
    let detectedCompany = '';
    for (const line of lines) {
      if (/^company\s*[:\-]/i.test(line)) {
        detectedCompany = line.replace(/^company\s*[:\-]\s*/i, '').trim();
        break;
      }
      for (const kw of COMPANY_KEYWORDS) {
        if (new RegExp(`\\b${kw}\\b`, 'i').test(line) && line.length < 50 && !EMAIL_REGEX.test(line)) {
          detectedCompany = line.trim();
          break;
        }
      }
      if (detectedCompany) break;
    }

    // 6. Extract Country & City
    let detectedCountry = 'India';
    for (const c of COUNTRIES) {
      if (new RegExp(`\\b${c}\\b`, 'i').test(rawText)) {
        detectedCountry = c === 'UK' ? 'United Kingdom' : c === 'UAE' ? 'United Arab Emirates' : c;
        break;
      }
    }

    let detectedCity = '';
    const cityList = ['Mumbai', 'Delhi', 'New Delhi', 'Bangalore', 'Bengaluru', 'Geneva', 'Zurich', 'Male', 'Dubai', 'Singapore', 'Paris', 'London', 'Srinagar', 'Goa', 'Kochi', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur'];
    for (const city of cityList) {
      if (new RegExp(`\\b${city}\\b`, 'i').test(rawText)) {
        detectedCity = city;
        break;
      }
    }

    // 7. Extract Person Name
    let detectedName = '';
    for (const line of lines) {
      if (/^(?:name|contact|guest)\s*[:\-]/i.test(line)) {
        detectedName = line.replace(/^(?:name|contact|guest)\s*[:\-]\s*/i, '').trim();
        break;
      }
      if (/^(?:mr\.|mrs\.|ms\.|dr\.|prof\.)\s+[a-zA-Z\s]{2,40}$/i.test(line)) {
        detectedName = line.trim();
        break;
      }
    }

    // If still no name, pick the first valid line that is not company, email, website, or phone
    if (!detectedName && lines.length > 0) {
      for (const line of lines) {
        const clean = line.replace(/[^a-zA-Z\s]/g, '').trim();
        const words = clean.split(/\s+/).filter(Boolean);
        const hasEmail = EMAIL_REGEX.test(line);
        const hasPhone = line.replace(/\D/g, '').length >= 6;
        const isUrl = /www\.|http|\.com|\.in|\.ch|\.org|\.net/i.test(line);
        const isCompany = detectedCompany && line.includes(detectedCompany);

        if (!hasEmail && !hasPhone && !isUrl && !isCompany && words.length >= 1 && words.length <= 4 && clean.length >= 3 && clean.length <= 35) {
          detectedName = line.trim();
          break;
        }
      }
    }

    const parsedData = {
      guestNames: detectedName || (detectedCompany ? `${detectedCompany} Guest` : 'Guest Traveler'),
      contactPerson: detectedName || (detectedCompany ? `${detectedCompany} Representative` : 'Representative'),
      email: email,
      contactNumber: detectedPhone || '+91 ',
      phone: detectedPhone || '+91 ',
      destination: detectedDestination || 'Europe Grand Tour',
      companyName: detectedCompany || (detectedCity ? `${detectedCity} Tours & Travels` : 'Travel Concierge Partners'),
      city: detectedCity || (detectedCountry === 'India' ? 'Mumbai' : detectedCountry),
      country: detectedCountry,
      travelDate: detectedTravelDate,
      rawText: rawText
    };

    res.json({
      success: true,
      message: 'Document OCR processed and structured entities extracted successfully.',
      data: parsedData
    });
  } catch (error) {
    console.error('Scanner error:', error);
    res.status(200).json({ success: false, message: 'Scan parsing error: ' + error.message });
  }
};
export default processScan;

