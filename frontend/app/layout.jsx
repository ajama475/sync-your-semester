import "./globals.css";

export const metadata = {
  title: {
    default: "Sync Your Semester",
    template: "%s | Sync Your Semester",
  },
  description:
    "A calm, local-first academic planning app that helps students set up their semester before deadlines sneak up on them.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#12141a" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        {/* Inline script to set theme before paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var stored = localStorage.getItem('sys-theme');
                  if (stored === 'light') {
                    document.documentElement.setAttribute('data-theme', 'light');
                  } else if (stored === 'dark') {
                    // default is dark, no attribute needed
                  } else {
                    // Auto-detect from OS
                    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
                      document.documentElement.setAttribute('data-theme', 'light');
                    }
                  }
                } catch(e) {}
              })();

              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(registration) {
                    console.log('SW registered: ', registration.scope);
                  }, function(err) {
                    console.log('SW registration failed: ', err);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
