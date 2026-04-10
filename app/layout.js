import './globals.css';

export const metadata = {
  title: 'Julsignals',
  description: 'Señales de scalping crypto',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
