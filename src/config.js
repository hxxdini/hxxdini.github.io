// Public business details for BidRadar's paid services. Approved for
// publication by hxxdini on 2026-11-04. Change them here only.
export const CONTACT = {
  phoneDisplay: '0785 287 446',
  phoneIntl: '256785287446',
  email: 'stordy007@gmail.com',
  telegramChannel: 'BidRadar',
  momoDisplay: 'MTN MoMo 0785 287 446',
};

// Cloudflare Web Analytics beacon token (public: it ships in every page).
// Empty means no analytics tag is added. Cookie-free, so no consent banner.
export const ANALYTICS_TOKEN = '';
export const analyticsTag = () => ANALYTICS_TOKEN
  ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${ANALYTICS_TOKEN}"}'></script>`
  : '';

export const whatsappLink = (text) => `https://wa.me/${CONTACT.phoneIntl}?text=${encodeURIComponent(text)}`;
export const channelLink = `https://t.me/${CONTACT.telegramChannel}`;

// Indicative prices in UGX; the final quote depends on the call.
export const PRICES = {
  alertsMonthly: 'UGX 30,000 / month',
  alertsYearly: 'UGX 250,000 / year',
  bidReview: 'UGX 100,000',
  bidPrep: 'from UGX 250,000',
  proposal: 'from UGX 500,000',
};
