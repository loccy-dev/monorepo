import type { Metadata } from "next";
import {NextIntlClientProvider} from 'next-intl';
import "./globals.css";


export const metadata: Metadata = {
  title: "next-intl | Loccy",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
