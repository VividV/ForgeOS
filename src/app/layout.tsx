import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "@/components/shell/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ForgeOS", template: "%s · ForgeOS" },
  description: "Know your factory. Control your production. Grow your business.",
  manifest: "/manifest.webmanifest",
  applicationName: "ForgeOS",
  appleWebApp: { capable: true, title: "ForgeOS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1b1f24",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen">
        {children}
        <ServiceWorkerRegister />
        <Toaster position="top-right" richColors closeButton toastOptions={{ className: "text-[13px]" }} />
      </body>
    </html>
  );
}
