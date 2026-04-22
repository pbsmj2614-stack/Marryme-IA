import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import Image from "next/image";
import { PostHogProvider } from "@/components/PostHogProvider";
import { QueryProvider } from "@/components/QueryProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: "MarryMe — Sistema de Roteiros",
  description: "Geração automática de roteiros e anúncios para prestadores de casamento",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body
        className={`${inter.variable} ${lora.variable} font-sans bg-gray-50 text-gray-900 antialiased`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center"
          style={{ mixBlendMode: "multiply" }}
        >
          <Image
            src="/logo-marryme.png"
            alt=""
            width={520}
            height={260}
            className="opacity-[0.045] select-none"
            priority={false}
          />
        </div>
        <div className="relative z-10">
          <QueryProvider>
            <PostHogProvider>{children}</PostHogProvider>
          </QueryProvider>
        </div>
      </body>
    </html>
  );
}
