import type { Metadata, Viewport } from "next";
import "./globals.css";
import { OfflineStatus } from "@/components/system/OfflineStatus";
import { PreferenceHydrator } from "@/components/settings/PreferenceHydrator";
import { ServiceWorkerRegistration } from "@/components/system/ServiceWorkerRegistration";
import { AppNavigation } from "@/components/navigation/AppNavigation";
import { DatabaseGate } from "@/components/system/DatabaseGate";
import { InstallPrompt } from "@/components/system/InstallPrompt";
import { RouteDocumentTitle } from "@/components/navigation/RouteDocumentTitle";
import { validateSeedContent } from "@/core/content/validate";

// Keep the content contract enforced at the application boundary as well as
// in the unit suite. This runs during server/build evaluation and prevents a
// malformed static dataset from silently producing a releasable page.
validateSeedContent();

export const metadata: Metadata = { title: "易境 · 个人易学学习工具", description: "用结构、练习和复习，建立自己的易学知识地图。", appleWebApp: { capable: true, title: "易境", statusBarStyle: "default" }, icons: { icon: "/icon.svg", apple: "/icon-192.png" } };

// Keep the app edge-to-edge capable on iOS while retaining a predictable
// layout on narrow Android browsers. Safe-area insets are consumed by the
// fixed/sticky UI in globals.css.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" data-scroll-behavior="smooth"><body><OfflineStatus /><DatabaseGate><PreferenceHydrator /><ServiceWorkerRegistration /><InstallPrompt /><RouteDocumentTitle /><AppNavigation />{children}</DatabaseGate></body></html>;
}
