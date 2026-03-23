import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "MarryMe — Sistema de Roteiros",
  description: "Geração automática de roteiros e anúncios para prestadores de casamento",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} font-sans bg-gray-50 text-gray-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
