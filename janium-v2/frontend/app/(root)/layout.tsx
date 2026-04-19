import RootClientLayout from "./client-layout";

// Force dynamic rendering
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RootClientLayout>{children}</RootClientLayout>;
}
