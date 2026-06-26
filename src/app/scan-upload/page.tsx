import { ScanUploadClient } from "./scan-upload-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Upload ID photo — Madagama" };

export default async function ScanUploadPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return <ScanUploadClient token={t ?? ""} />;
}
