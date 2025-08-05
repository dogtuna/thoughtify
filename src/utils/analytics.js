const GA_ID = 'G-18M1BPL5F3';

export function initAnalytics() {
  if (window.gtag) return;

  const script = document.createElement('script');
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  script.async = true;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag(){window.dataLayer.push(arguments);}
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA_ID);
}

export function getAnalyticsConsent() {
  return localStorage.getItem('analytics_consent');
}

export function setAnalyticsConsent(value) {
  localStorage.setItem('analytics_consent', value);
  if (value === 'granted') {
    window[`ga-disable-${GA_ID}`] = false;
    initAnalytics();
  } else {
    window[`ga-disable-${GA_ID}`] = true;
  }
}
