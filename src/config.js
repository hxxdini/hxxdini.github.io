// Public business details for FundRadar's paid services. Approved for
// publication by hxxdini on 2026-11-04. Change them here only.
export const CONTACT = {
  phoneDisplay: '0785 287 446',
  phoneIntl: '256785287446',
  email: 'stordy007@gmail.com',
  telegramChannel: 'fundradarea',
  momoDisplay: 'MTN MoMo 0785 287 446',
};

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
