import Link from 'next/link';

import { StatusCard } from '@/components/status-card';

export default function OfflinePage() {
  return (
    <StatusCard
      tone="offline"
      title="Backend offline help"
      message="The frontend is running, but it could not reach the FastAPI backend. Start the API server, check NEXT_PUBLIC_API_BASE_URL, and make sure CORS allows the web app origin."
      primaryAction={
        <Link href="/" className="kid-button bg-kid-orange hover:bg-secondary-dark">
          Back Home
        </Link>
      }
      secondaryHref="/parents"
      secondaryLabel="Parent Area"
    />
  );
}
