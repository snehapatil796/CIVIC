import type { LanguageCode } from '../types/civic';

export const TRANSLATIONS: Record<
  LanguageCode,
  {
    brand: string;
    nav: {
      overview: string;
      report: string;
      map: string;
      analytics: string;
      official: string;
    };
    actions: {
      signIn: string;
      signOut: string;
      reportIssue: string;
      trackNow: string;
      analyzeAI: string;
      submitComplaint: string;
      detectGps: string;
      recordVoice: string;
      stopRecording: string;
      transcribing: string;
      verifyIssue: string;
      verifyResolved: string;
      refreshPredictions: string;
    };
    hero: {
      kicker: string;
      title: string;
      subtitle: string;
      trackPlaceholder: string;
    };
    kpis: {
      total: string;
      resolved: string;
      avgTime: string;
      escalated: string;
    };
    statuses: Record<string, string>;
    categories: Record<string, string>;
    form: {
      heading: string;
      subheading: string;
      titleLabel: string;
      titlePlaceholder: string;
      descLabel: string;
      descPlaceholder: string;
      langLabel: string;
      wardLabel: string;
      addressLabel: string;
      addressPlaceholder: string;
      mediaLabel: string;
      photoHint: string;
      videoHint: string;
      voiceHint: string;
      aiTriageTitle: string;
      duplicateAlert: string;
      loginRequired: string;
    };
    footer: {
      disclaimer: string;
    };
  }
> = {
  en: {
    brand: 'CIVIC',
    nav: {
      overview: 'Overview',
      report: 'Report Issue',
      map: 'Live Map',
      analytics: 'Analytics',
      official: 'Official Desk',
    },
    actions: {
      signIn: 'Sign In',
      signOut: 'Sign Out',
      reportIssue: 'Report Issue',
      trackNow: 'Track ID',
      analyzeAI: 'Analyze with AI',
      submitComplaint: 'Submit Grievance',
      detectGps: 'Detect GPS Location',
      recordVoice: 'Record Voice Note',
      stopRecording: 'Stop & Transcribe',
      transcribing: 'Transcribing audio...',
      verifyIssue: 'Confirm Issue',
      verifyResolved: 'Verify Repair',
      refreshPredictions: 'Refresh AI Forecast',
    },
    hero: {
      kicker: 'Public Grievance & Municipal Accountability Platform',
      title: 'Report civic issues clearly. Track every resolution publicly.',
      subtitle:
        'Submit road damage, water leaks, sewage overflows, waste accumulation, or streetlight outages in English or Kannada with GPS coordinates, voice notes, photos, and video.',
      trackPlaceholder: 'Enter Tracking ID (e.g. CIV-2026-1001)',
    },
    kpis: {
      total: 'Total Reported',
      resolved: 'Resolved Issues',
      avgTime: 'Avg Resolution Time',
      escalated: 'Overdue / Escalated',
    },
    statuses: {
      All: 'All Statuses',
      Submitted: 'Submitted',
      Accepted: 'Accepted',
      'In Progress': 'In Progress',
      Resolved: 'Resolved',
      Escalated: 'Escalated',
    },
    categories: {
      All: 'All Categories',
      'Road Damage': 'Road Damage',
      'Water Leakage': 'Water Leakage',
      'Sewage Overflow': 'Sewage Overflow',
      'Garbage Accumulation': 'Garbage Accumulation',
      'Streetlight Failure': 'Streetlight Failure',
      'Drainage Blockage': 'Drainage Blockage',
      Other: 'Other',
    },
    form: {
      heading: 'Submit a Civic Grievance',
      subheading:
        'Describe the problem in English or Kannada, attach visual evidence or record a voice report, and pin the exact GPS coordinates.',
      titleLabel: 'Issue Headline',
      titlePlaceholder: 'e.g. Deep pothole near Indiranagar 80 Feet Road junction',
      descLabel: 'Detailed Description',
      descPlaceholder: 'Describe severity, landmarks, and public safety impact...',
      langLabel: 'Complaint Language',
      wardLabel: 'Municipal Ward',
      addressLabel: 'Street Address / Landmark',
      addressPlaceholder: 'Street name, cross road, or nearest landmark',
      mediaLabel: 'Photo, Video & Voice Evidence',
      photoHint: 'Upload Photo (AI analyzes issue automatically)',
      videoHint: 'Attach Short Video (optional, max 12 MB)',
      voiceHint: 'Record voice complaint in English or Kannada',
      aiTriageTitle: 'AI Triage & Classification Preview',
      duplicateAlert: 'Potential Duplicate Detected Nearby',
      loginRequired: 'Sign in as a Citizen to file a tracked grievance and receive updates.',
    },
    footer: {
      disclaimer:
        'Academic prototype for smart civic grievance demonstration. Real municipal submission and department integration require official government authorization.',
    },
  },
  kn: {
    brand: 'CIVIC',
    nav: {
      overview: 'ಮುಖಪುಟ',
      report: 'ದೂರು ದಾಖಲಿಸಿ',
      map: 'ನೇರ ನಕ್ಷೆ',
      analytics: 'ವಿಶ್ಲೇಷಣೆ',
      official: 'ಅಧಿಕಾರಿ ವಿಭಾಗ',
    },
    actions: {
      signIn: 'ಲಾಗಿನ್',
      signOut: 'ಲಾಗ್ ಔಟ್',
      reportIssue: 'ದೂರು ನೀಡಿ',
      trackNow: 'ಪರಿಶೀಲಿಸಿ',
      analyzeAI: 'AI ವಿಶ್ಲೇಷಣೆ',
      submitComplaint: 'ದೂರು ಸಲ್ಲಿಸಿ',
      detectGps: 'GPS ಸ್ಥಳ ಪತ್ತೆಹಚ್ಚಿ',
      recordVoice: 'ಧ್ವನಿ ದೂರು ರೆಕಾರ್ಡ್',
      stopRecording: 'ನಿಲ್ಲಿಸಿ ಮತ್ತು ಪಠ್ಯಕ್ಕೆ ಬದಲಿಸಿ',
      transcribing: 'ಧ್ವನಿಯನ್ನು ಪಠ್ಯಕ್ಕೆ ಬದಲಿಸಲಾಗುತ್ತಿದೆ...',
      verifyIssue: 'ಸಮಸ್ಯೆ ದೃಢೀಕರಿಸಿ',
      verifyResolved: 'ಪರಿಹಾರ ದೃಢೀಕರಿಸಿ',
      refreshPredictions: 'AI ಮುನ್ಸೂಚನೆ ನವೀಕರಿಸಿ',
    },
    hero: {
      kicker: 'ನಾಗರಿಕ ಕುಂದುಕೊರತೆ ಮತ್ತು ಸರ್ಕಾರಿ ಸ್ಪಂದನೆ ವೇದಿಕೆ',
      title: 'ಸಾರ್ವಜನಿಕ ಸಮಸ್ಯೆಗಳನ್ನು ವರದಿ ಮಾಡಿ. ಪ್ರತಿ ಪರಿಹಾರವನ್ನು ಪಾರದರ್ಶಕವಾಗಿ ಗಮನಿಸಿ.',
      subtitle:
        'ರಸ್ತೆ ಗುಂಡಿ, ನೀರಿನ ಸೋರಿಕೆ, ಒಳಚರಂಡಿ, ಕಸದ ರಾಶಿ ಅಥವಾ ಬೀದಿ ದೀಪ ಸಮಸ್ಯೆಗಳನ್ನು ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ GPS, ಧ್ವನಿ, ಫೋಟೋ ಮತ್ತು ವೀಡಿಯೊದೊಂದಿಗೆ ಸಲ್ಲಿಸಿ.',
      trackPlaceholder: 'ಟ್ರ್ಯಾಕಿಂಗ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ (ಉದಾ. CIV-2026-1001)',
    },
    kpis: {
      total: 'ಒಟ್ಟು ದೂರುಗಳು',
      resolved: 'ಪರಿಹಾರವಾದವು',
      avgTime: 'ಸರಾಸರಿ ಪರಿಹಾರ ಸಮಯ',
      escalated: 'ಅವಧಿ ಮೀರಿದ / ಮೇಲ್ಮಟ್ಟದವು',
    },
    statuses: {
      All: 'ಎಲ್ಲಾ ಸ್ಥಿತಿಗಳು',
      Submitted: 'ಸಲ್ಲಿಸಲಾಗಿದೆ',
      Accepted: 'ಸ್ವೀಕರಿಸಲಾಗಿದೆ',
      'In Progress': 'ಪ್ರಗತಿಯಲ್ಲಿದೆ',
      Resolved: 'ಪರಿಹಾರವಾಗಿದೆ',
      Escalated: 'ಮೇಲ್ಮಟ್ಟಕ್ಕೆ ಏರಿಸಲಾಗಿದೆ',
    },
    categories: {
      All: 'ಎಲ್ಲಾ ವಿಭಾಗಗಳು',
      'Road Damage': 'ರಸ್ತೆ ಹಾನಿ',
      'Water Leakage': 'ನೀರಿನ ಸೋರಿಕೆ',
      'Sewage Overflow': 'ಒಳಚರಂಡಿ ಉಕ್ಕಿ ಹರಿವು',
      'Garbage Accumulation': 'ಕಸ ಸಂಗ್ರಹಣೆ',
      'Streetlight Failure': 'ಬೀದಿ ದೀಪ ಸಮಸ್ಯೆ',
      'Drainage Blockage': 'ಚರಂಡಿ ತಡೆ',
      Other: 'ಇತರೆ',
    },
    form: {
      heading: 'ನಾಗರಿಕ ದೂರು ಸಲ್ಲಿಸಿ',
      subheading:
        'ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಸಮಸ್ಯೆಯನ್ನು ವಿವರಿಸಿ, ಫೋಟೋ/ವೀಡಿಯೊ ಅಥವಾ ಧ್ವನಿ ದೂರನ್ನು ಸೇರಿಸಿ ಮತ್ತು GPS ಸ್ಥಳವನ್ನು ಗುರುತಿಸಿ.',
      titleLabel: 'ದೂರಿನ ಶೀರ್ಷಿಕೆ',
      titlePlaceholder: 'ಉದಾ. ಇಂದಿರಾನಗರ 80 ಅಡಿ ರಸ್ತೆಯಲ್ಲಿ ಆಳವಾದ ರಸ್ತೆ ಗುಂಡಿ',
      descLabel: 'ವಿವರವಾದ ಮಾಹಿತಿ',
      descPlaceholder: 'ಸಮಸ್ಯೆಯ ತೀವ್ರತೆ, ಹತ್ತಿರದ ಗುರುತು ಮತ್ತು ಸಾರ್ವಜನಿಕ ತೊಂದರೆಯನ್ನು ವಿವರಿಸಿ...',
      langLabel: 'ದೂರಿನ ಭಾಷೆ',
      wardLabel: 'ಮಹಾನಗರ ಪಾಲಿಕೆ ವಾರ್ಡ್',
      addressLabel: 'ವಿಳಾಸ / ಹತ್ತಿರದ ಗುರುತು',
      addressPlaceholder: 'ರಸ್ತೆ ಹೆಸರು, ಕ್ರಾಸ್ ಅಥವಾ ಹತ್ತಿರದ ಗುರುತು',
      mediaLabel: 'ಫೋಟೋ, ವೀಡಿಯೊ ಮತ್ತು ಧ್ವನಿ ಪುರಾವೆ',
      photoHint: 'ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ (AI ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಪರಿಶೀಲಿಸುತ್ತದೆ)',
      videoHint: 'ಸಣ್ಣ ವೀಡಿಯೊ ಸೇರಿಸಿ (ಐಚ್ಛಿಕ, ಗರಿಷ್ಠ 12 MB)',
      voiceHint: 'ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಧ್ವನಿ ದೂರು ರೆಕಾರ್ಡ್ ಮಾಡಿ',
      aiTriageTitle: 'AI ವರ್ಗೀಕರಣ ಮತ್ತು ಆದ್ಯತೆ ಪೂರ್ವವೀಕ್ಷಣೆ',
      duplicateAlert: 'ಹತ್ತಿರದಲ್ಲಿ ಇದೇ ರೀತಿಯ ದೂರು ಕಂಡುಬಂದಿದೆ',
      loginRequired: 'ದೂರು ದಾಖಲಿಸಲು ಮತ್ತು ನವೀಕರಣಗಳನ್ನು ಪಡೆಯಲು ನಾಗರಿಕ ಲಾಗಿನ್ ಮಾಡಿ.',
    },
    footer: {
      disclaimer:
        'ಶೈಕ್ಷಣಿಕ ಮಾದರಿ (Academic Prototype). ನೈಜ ಸರ್ಕಾರಿ ಇಲಾಖೆ ಏಕೀಕರಣಕ್ಕೆ ಅಧಿಕೃತ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ.',
    },
  },
};

export const BENGALURU_WARDS = [
  'Ward 65 · Malleshwaram',
  'Ward 80 · Indiranagar',
  'Ward 84 · Whitefield',
  'Ward 98 · Rajajinagar',
  'Ward 150 · Bellandur',
  'Ward 151 · Koramangala',
  'Ward 168 · Jayanagar',
  'Ward 174 · HSR Layout',
  'Ward 110 · Sampangiram Nagar',
  'Ward 45 · Hebbal',
];

export const DEPARTMENTS = [
  'All Departments',
  'Roads & Infrastructure',
  'Water Supply & Drainage',
  'Sanitation & Waste',
  'Electrical & Streetlights',
  'Sewerage & Public Health',
  'Municipal General Desk',
];
