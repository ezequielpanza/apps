import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "sailward.pages.dev";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = `${protocol}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: "Sailward · Real-time sailing",
    description:
      "Navegá el mundo real en un velero persistente, impulsado por el viento y el reloj reales.",
    applicationName: "Sailward",
    openGraph: {
      title: "Sailward · Real-time sailing",
      description:
        "Elegí un puerto real, fijá el rumbo y dejá que el viaje continúe.",
      type: "website",
      images: [{ url: "/og.png", width: 1731, height: 909, alt: "Sailward" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Sailward · Real-time sailing",
      description: "El mundo real. Tu velero. El tiempo sigue corriendo.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
