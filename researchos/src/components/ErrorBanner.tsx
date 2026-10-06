'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function Inner() {
  const error = useSearchParams().get('error');
  return error ? <div className="alert" role="alert">{error}</div> : null;
}

export function ErrorBanner() {
  return <Suspense><Inner /></Suspense>;
}
