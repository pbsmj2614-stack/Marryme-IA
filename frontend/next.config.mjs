import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  // Impede o Next.js de empacotar esses módulos CommonJS — devem ser resolvidos do node_modules
  serverExternalPackages: ["pdfjs-dist", "mammoth", "pdf-parse"],
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload source maps apenas em produção (CI)
  silent: true,
  widenClientFileUpload: true,
  // Não injeta Sentry no bundle se DSN não estiver configurado
  disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableServerWebpackPlugin: !process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN,
});
