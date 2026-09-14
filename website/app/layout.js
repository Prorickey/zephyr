import './globals.css';

export const metadata = {
  title: 'Zephyr — Autonomous Electric Scooter',
  description: 'Zephyr: an autonomous electric scooter by Joshua Chilukuri and Trevor Bedson.',
};

export const viewport = {
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
};

// Testing / reduced-motion escape hatch: append ?noanim to the URL to render
// everything in its final state with no entrance animations. Runs inline
// before first paint so nothing flashes.
const NOANIM_SCRIPT =
  "if(location.search.indexOf('noanim')!==-1){document.documentElement.setAttribute('data-noanim','')}";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NOANIM_SCRIPT }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. Grammarly) inject
          attributes on <html>/<body> before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
